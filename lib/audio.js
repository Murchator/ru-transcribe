// Browser-side audio pipeline.
//
// Why this exists: the transcription API takes files up to 25 MB, and serverless
// hosts cap request bodies around 4.5 MB. Long lesson recordings blow past both.
// So we do the heavy lifting in the teacher's browser:
//
//   1. decode whatever they uploaded or recorded (mp3, m4a, wav, mp4, webm, ...)
//   2. downmix to mono and resample to 16 kHz (what the model listens at anyway)
//   3. let them trim out the bad bits
//   4. cut the result into ~9-minute pieces, snapping each cut to the quietest
//      moment nearby so we never slice through the middle of a word
//   5. re-encode each piece as a small mono MP3
//
// Step 4 is the one that matters most for quality. Naive fixed-length splitting
// is a major source of garbled text at chunk boundaries.
//
// Audio is held as Int16Array rather than Float32Array: half the memory, which
// matters when someone drops in an hour-long recording on a phone.

export const SAMPLE_RATE = 16000;
const TARGET_CHUNK_SEC = 540; // ~9 min -> roughly 2.5 MB at 40 kbps
const SEARCH_WINDOW_SEC = 45; // how far we'll wander to find a quiet spot
const SILENCE_PROBE_SEC = 0.4; // resolution of the loudness scan
const MP3_KBPS = 40; // plenty for 16 kHz mono speech

/* ------------------------------------------------------------- decoding */

/** Decode a File or Blob into mono 16 kHz Int16 samples. */
export async function decodeToMono16k(file, onProgress) {
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

  onProgress?.("Готовим звук…");
  const frames = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offline = new OAC(1, frames, SAMPLE_RATE);
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
  return pcm;
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
  let cursor = 0; // position in timeline coordinates

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

/** Timeline position -> index into the original pcm. */
export function timelineToSource(segments, pos) {
  let cursor = 0;
  for (const [s, e] of segments) {
    const len = e - s;
    if (pos < cursor + len) return s + (pos - cursor);
    cursor += len;
  }
  return segments.length ? segments[segments.length - 1][1] : 0;
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
export function toAudioBuffer(ctx, pcm, segments, from, to) {
  const slice = materialize(pcm, segments, from, to);
  const buffer = ctx.createBuffer(1, Math.max(1, slice.length), SAMPLE_RATE);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < slice.length; i++) channel[i] = slice[i] / 32768;
  return buffer;
}

/* ------------------------------------------------------------- chunking */

/**
 * Split into chunk boundaries, snapping each cut to the quietest 0.4 s window
 * within +/- SEARCH_WINDOW_SEC of the ideal position. Works in timeline
 * coordinates, so it accounts for whatever was trimmed out.
 */
export function findChunkBoundaries(pcm, segments) {
  const total = segmentsLength(segments);
  const chunkLen = TARGET_CHUNK_SEC * SAMPLE_RATE;
  if (total <= chunkLen * 1.15) return [[0, total]];

  const probe = Math.floor(SILENCE_PROBE_SEC * SAMPLE_RATE);
  const search = SEARCH_WINDOW_SEC * SAMPLE_RATE;

  // Energy profile at probe resolution, over the edited timeline.
  const probes = Math.ceil(total / probe);
  const energy = new Float64Array(probes);
  {
    let cursor = 0;
    for (const [s, e] of segments) {
      for (let i = s; i < e; i += 4) {
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

/** Encode a window of the edited timeline to an MP3 Blob. */
export async function encodeMp3(pcm, segments, from, to) {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const encoder = new Mp3Encoder(1, SAMPLE_RATE, MP3_KBPS);
  const samples = materialize(pcm, segments, from, to);
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
