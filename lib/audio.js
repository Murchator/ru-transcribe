// Browser-side audio pipeline.
//
// Two jobs pull in opposite directions:
//
//   * Transcription wants small files. The API caps uploads at 25 MB and
//     serverless hosts cap request bodies near 4.5 MB. The model listens at
//     16 kHz anyway, so anything above that is wasted bytes.
//   * Listening wants fidelity. A teacher downloading the MP3 for students
//     should get something that sounds like the room, not like a phone call.
//
// So we keep a good-quality master and only shrink at the last moment, on the
// way to the transcription API. What you hear, and what you download, is the
// master.
//
// Audio is held as Int16Array rather than Float32Array: half the memory.

export const TRANSCRIBE_RATE = 16000; // what the model listens at
export const MASTER_RATE = 48000; // what we keep for listening

// Above this length, keeping a 48 kHz master costs too much memory (~96 KB per
// second), so long recordings are held at transcription quality instead. Nobody
// hands students a two-hour raw lecture anyway.
const MASTER_RATE_MAX_MINUTES = 25;

const TARGET_CHUNK_SEC = 540; // ~9 min
const SEARCH_WINDOW_SEC = 45; // how far we'll wander to find a quiet spot
const SILENCE_PROBE_SEC = 0.4; // resolution of the loudness scan
const TRANSCRIBE_KBPS = 40; // plenty for 16 kHz mono speech
const LISTEN_KBPS = 128; // comfortable for sharing with students

/* ------------------------------------------------------------- decoding */

/**
 * Decode a File or Blob to mono Int16 samples.
 * Returns { pcm, rate } — rate is 48000 for normal recordings, 16000 for very
 * long ones.
 */
export async function decodeAudio(file, onProgress) {
  onProgress?.("Читаем файл…");
  const arrayBuffer = await file.arrayBuffer();

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC)
    throw new Error(
      "Этот браузер не умеет обрабатывать звук. Попробуйте Chrome, Edge, Safari или Firefox."
    );

  const ctx = new AC();
  let decoded;
  try {
    onProgress?.("Раскодируем звук…");
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error(
      "Не удалось прочитать этот файл. Попробуйте сначала перевести его в MP3, M4A или WAV."
    );
  } finally {
    ctx.close?.();
  }

  const rate =
    decoded.duration > MASTER_RATE_MAX_MINUTES * 60 ? TRANSCRIBE_RATE : MASTER_RATE;

  onProgress?.("Готовим звук…");
  const frames = Math.max(1, Math.ceil(decoded.duration * rate));
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offline = new OAC(1, frames, rate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  const float = rendered.getChannelData(0);
  const pcm = new Int16Array(float.length);
  for (let i = 0; i < float.length; i++) {
    const s = Math.max(-1, Math.min(1, float[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return { pcm, rate };
}

/**
 * 48 kHz -> 16 kHz by averaging every 3 samples. The averaging doubles as the
 * anti-aliasing filter, which plain sample-dropping would skip — that's what
 * makes cheap downsampling sound harsh.
 */
export function toTranscribeRate(samples, rate) {
  if (rate === TRANSCRIBE_RATE) return samples;
  const factor = Math.round(rate / TRANSCRIBE_RATE);
  const out = new Int16Array(Math.floor(samples.length / factor));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    const start = i * factor;
    for (let j = 0; j < factor; j++) sum += samples[start + j];
    out[i] = sum / factor;
  }
  return out;
}

/* ------------------------------------------------- the edit list (trimming)
 *
 * An edited recording is just the original samples plus an ordered list of
 * ranges to keep: [[start, end], ...]. Deleting a section splices that list.
 * Nothing is copied, so undo is free and trimming an hour-long file is instant.
 */

export function fullSegments(pcm) {
  return [[0, pcm.length]];
}

export function segmentsLength(segments) {
  let total = 0;
  for (const [s, e] of segments) total += e - s;
  return total;
}

/** Remove [from, to) in *edited* (timeline) coordinates. */
export function deleteRange(segments, from, to) {
  if (to <= from) return segments;
  const out = [];
  let cursor = 0;

  for (const [s, e] of segments) {
    const len = e - s;
    const segStart = cursor;
    const segEnd = cursor + len;
    cursor = segEnd;

    if (segEnd <= from || segStart >= to) {
      out.push([s, e]); // untouched
      continue;
    }
    if (segStart < from) out.push([s, s + (from - segStart)]); // head survives
    if (segEnd > to) out.push([s + (to - segStart), e]); // tail survives
  }
  return out.filter(([s, e]) => e > s);
}

/** Keep only [from, to) in timeline coordinates. */
export function cropRange(segments, from, to) {
  const total = segmentsLength(segments);
  let out = deleteRange(segments, to, total);
  out = deleteRange(out, 0, from);
  return out;
}

/** Copy out a slice of the edited timeline as contiguous samples. */
export function materialize(pcm, segments, from = 0, to = null) {
  const total = segmentsLength(segments);
  const end = to == null ? total : Math.min(to, total);
  const start = Math.max(0, from);
  const out = new Int16Array(Math.max(0, end - start));

  let cursor = 0;
  let written = 0;
  for (const [s, e] of segments) {
    const len = e - s;
    const segStart = cursor;
    const segEnd = cursor + len;
    cursor = segEnd;
    if (segEnd <= start || segStart >= end) continue;

    const takeFrom = s + Math.max(0, start - segStart);
    const takeTo = s + Math.min(len, end - segStart);
    out.set(pcm.subarray(takeFrom, takeTo), written);
    written += takeTo - takeFrom;
  }
  return out;
}

/**
 * Min/max per pixel column for drawing the waveform. Walks the segment list
 * directly and strides through samples, so redrawing stays cheap no matter how
 * long the recording is.
 */
export function computePeaks(pcm, segments, width) {
  const total = segmentsLength(segments);
  const mins = new Float32Array(width).fill(0);
  const maxs = new Float32Array(width).fill(0);
  if (!total || width <= 0) return { mins, maxs };

  const perPixel = total / width;
  const stride = Math.max(1, Math.floor(perPixel / 160));

  let cursor = 0;
  for (const [s, e] of segments) {
    for (let i = s; i < e; i += stride) {
      const col = Math.min(width - 1, ((cursor + (i - s)) / perPixel) | 0);
      const v = pcm[i] / 32768;
      if (v < mins[col]) mins[col] = v;
      if (v > maxs[col]) maxs[col] = v;
    }
    cursor += e - s;
  }
  return { mins, maxs };
}

/* ------------------------------------------------------------- playback */

/** Build a playable AudioBuffer from a window of the edited timeline. */
export function toAudioBuffer(ctx, pcm, rate, segments, from, to) {
  const slice = materialize(pcm, segments, from, to);
  const buffer = ctx.createBuffer(1, Math.max(1, slice.length), rate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < slice.length; i++) channel[i] = slice[i] / 32768;
  return buffer;
}

/* ------------------------------------------------------------- chunking */

/**
 * Split into chunk boundaries, snapping each cut to the quietest window within
 * +/- SEARCH_WINDOW_SEC of the ideal position. Works in timeline coordinates,
 * so it accounts for whatever was trimmed out.
 */
export function findChunkBoundaries(pcm, segments, rate) {
  const total = segmentsLength(segments);
  const chunkLen = TARGET_CHUNK_SEC * rate;
  if (total <= chunkLen * 1.15) return [[0, total]];

  const probe = Math.floor(SILENCE_PROBE_SEC * rate);
  const search = SEARCH_WINDOW_SEC * rate;

  // Energy profile at probe resolution, over the edited timeline.
  const probes = Math.ceil(total / probe);
  const energy = new Float64Array(probes);
  {
    let cursor = 0;
    const stride = Math.max(1, Math.round(rate / 4000));
    for (const [s, e] of segments) {
      for (let i = s; i < e; i += stride) {
        const idx = ((cursor + (i - s)) / probe) | 0;
        if (idx < probes) energy[idx] += (pcm[i] / 32768) ** 2;
      }
      cursor += e - s;
    }
  }

  const cuts = [0];
  let pos = chunkLen;
  while (pos < total - chunkLen * 0.35) {
    const from = Math.max(cuts[cuts.length - 1] + probe, pos - search);
    const to = Math.min(total - probe, pos + search);

    let bestAt = pos;
    let best = Infinity;
    for (let p = (from / probe) | 0; p <= (to / probe) | 0 && p < probes; p++) {
      if (energy[p] < best) {
        best = energy[p];
        bestAt = p * probe + (probe >> 1); // cut in the middle of the quiet patch
      }
    }
    cuts.push(bestAt);
    pos = bestAt + chunkLen;
  }

  cuts.push(total);
  const ranges = [];
  for (let i = 0; i < cuts.length - 1; i++) ranges.push([cuts[i], cuts[i + 1]]);
  return ranges;
}

/* -------------------------------------------------------------- encoding */

async function encode(samples, rate, kbps) {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const encoder = new Mp3Encoder(1, rate, kbps);
  const blockSize = 1152 * 20;
  const parts = [];

  for (let i = 0; i < samples.length; i += blockSize) {
    const block = samples.subarray(i, Math.min(i + blockSize, samples.length));
    const buf = encoder.encodeBuffer(block);
    if (buf.length > 0) parts.push(new Uint8Array(buf));
    if (i % (blockSize * 8) === 0) await new Promise((r) => setTimeout(r, 0)); // let the UI paint
  }

  const tail = encoder.flush();
  if (tail.length > 0) parts.push(new Uint8Array(tail));
  return new Blob(parts, { type: "audio/mpeg" });
}

/** Small, 16 kHz, for sending to the transcription API. */
export async function encodeForTranscription(pcm, rate, segments, from, to) {
  const slice = materialize(pcm, segments, from, to);
  return encode(toTranscribeRate(slice, rate), TRANSCRIBE_RATE, TRANSCRIBE_KBPS);
}

/** Full quality, for the teacher to download and share. */
export async function encodeForListening(pcm, rate, segments) {
  return encode(materialize(pcm, segments), rate, LISTEN_KBPS);
}

/* --------------------------------------------------------------- format */

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export function formatClock(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const tenths = Math.floor((s * 10) % 10);
  return `${m}:${String(sec).padStart(2, "0")}.${tenths}`;
}
