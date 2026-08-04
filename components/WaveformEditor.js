"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SAMPLE_RATE,
  computePeaks,
  cropRange,
  deleteRange,
  encodeMp3,
  formatClock,
  formatDuration,
  segmentsLength,
  toAudioBuffer,
} from "@/lib/audio";

// Play in windows rather than building one giant AudioBuffer, so memory stays
// flat whether the recording is two minutes or two hours.
const PLAY_WINDOW_SEC = 120;

export default function WaveformEditor({ pcm, segments, onChange, disabled, exportName }) {
  const [history, setHistory] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [selection, setSelection] = useState(null); // [a, b] in samples
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [width, setWidth] = useState(0);

  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const peaksRef = useRef(null);
  const dragRef = useRef(null);

  const audioRef = useRef(null);
  const sourceRef = useRef(null);
  const tokenRef = useRef(0);
  const rafRef = useRef(null);
  const anchorRef = useRef({ ctxTime: 0, pos: 0 });

  const total = segmentsLength(segments);
  const duration = total / SAMPLE_RATE;

  /* ---------------------------------------------------------- sizing */

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => setWidth(box.clientWidth));
    ro.observe(box);
    setWidth(box.clientWidth);
    return () => ro.disconnect();
  }, []);

  /* --------------------------------------------------------- drawing */

  useEffect(() => {
    if (!width) return;
    peaksRef.current = computePeaks(pcm, segments, width);
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcm, segments, width]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const peaks = peaksRef.current;
    if (!canvas || !peaks || !width) return;

    const dpr = window.devicePixelRatio || 1;
    const h = 120;
    if (canvas.width !== width * dpr || canvas.height !== h * dpr) {
      canvas.width = width * dpr;
      canvas.height = h * dpr;
      canvas.style.height = `${h}px`;
    }

    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, h);

    const mid = h / 2;
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue("--accent").trim() || "#b5541f";

    // selection band
    if (selection) {
      const x1 = (selection[0] / total) * width;
      const x2 = (selection[1] / total) * width;
      g.fillStyle = "rgba(181, 84, 31, 0.13)";
      g.fillRect(x1, 0, Math.max(1, x2 - x1), h);
    }

    // waveform
    g.strokeStyle = accent;
    g.globalAlpha = 0.85;
    g.beginPath();
    for (let x = 0; x < width; x++) {
      const top = mid - peaks.maxs[x] * (mid - 4);
      const bottom = mid - peaks.mins[x] * (mid - 4);
      g.moveTo(x + 0.5, Math.min(top, mid - 0.5));
      g.lineTo(x + 0.5, Math.max(bottom, mid + 0.5));
    }
    g.stroke();
    g.globalAlpha = 1;

    // centre line
    g.strokeStyle = "rgba(0,0,0,0.12)";
    g.beginPath();
    g.moveTo(0, mid);
    g.lineTo(width, mid);
    g.stroke();

    // playhead
    const px = (playhead / total) * width;
    g.strokeStyle = "#1f1d1a";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px, 0);
    g.lineTo(px, h);
    g.stroke();
    g.lineWidth = 1;
  }, [width, selection, playhead, total]);

  useEffect(() => {
    draw();
  }, [draw]);

  /* -------------------------------------------------------- playback */

  const stopPlayback = useCallback(() => {
    tokenRef.current++;
    cancelAnimationFrame(rafRef.current);
    try {
      sourceRef.current?.stop();
    } catch {}
    sourceRef.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);
  // Any edit invalidates what's currently playing.
  useEffect(() => stopPlayback(), [segments, stopPlayback]);

  function ensureCtx() {
    if (!audioRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioRef.current = new AC();
    }
    audioRef.current.resume?.();
    return audioRef.current;
  }

  function playFrom(from, to) {
    const ctx = ensureCtx();
    const token = ++tokenRef.current;
    const windowEnd = Math.min(to, from + PLAY_WINDOW_SEC * SAMPLE_RATE);

    const src = ctx.createBufferSource();
    src.buffer = toAudioBuffer(ctx, pcm, segments, from, windowEnd);
    src.connect(ctx.destination);
    src.onended = () => {
      if (tokenRef.current !== token) return; // superseded by a stop or a new play
      if (windowEnd < to) playFrom(windowEnd, to);
      else {
        cancelAnimationFrame(rafRef.current);
        setPlaying(false);
        setPlayhead(to);
      }
    };
    src.start();
    sourceRef.current = src;
    anchorRef.current = { ctxTime: ctx.currentTime, pos: from };
    setPlaying(true);

    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const { ctxTime, pos } = anchorRef.current;
      setPlayhead(Math.min(to, pos + (ctx.currentTime - ctxTime) * SAMPLE_RATE));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  function togglePlay() {
    if (playing) {
      stopPlayback();
      return;
    }
    if (selection) playFrom(selection[0], selection[1]);
    else playFrom(playhead >= total - SAMPLE_RATE * 0.2 ? 0 : playhead, total);
  }

  /* ----------------------------------------------------------- edits */

  function apply(next) {
    if (!next.length) return;
    setHistory((h) => [...h.slice(-30), segments]);
    setSelection(null);
    setPlayhead(0);
    onChange(next);
  }

  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
      onChange(h[h.length - 1]);
      setSelection(null);
      return h.slice(0, -1);
    });
  }

  async function exportMp3() {
    setExporting(true);
    try {
      const blob = await encodeMp3(pcm, segments, 0, total);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(exportName || "recording").replace(/\.[^.]+$/, "")}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  /* -------------------------------------------------------- pointer */

  function posFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return Math.round(ratio * total);
  }

  function onPointerDown(e) {
    if (disabled) return;
    canvasRef.current.setPointerCapture(e.pointerId);
    const pos = posFromEvent(e);
    dragRef.current = { start: pos, startX: e.clientX, moved: false };
    setSelection(null);
  }

  function onPointerMove(e) {
    const drag = dragRef.current;
    if (!drag) return;
    if (Math.abs(e.clientX - drag.startX) > 4) drag.moved = true;
    if (!drag.moved) return;
    const pos = posFromEvent(e);
    setSelection([Math.min(drag.start, pos), Math.max(drag.start, pos)]);
  }

  function onPointerUp(e) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (!drag.moved) {
      stopPlayback();
      setSelection(null);
      setPlayhead(posFromEvent(e));
    }
  }

  /* ------------------------------------------------------------- ui */

  const selDuration = selection ? (selection[1] - selection[0]) / SAMPLE_RATE : 0;
  const hasSelection = selection && selection[1] - selection[0] > SAMPLE_RATE * 0.05;

  return (
    <div>
      <div className="wavebox" ref={boxRef}>
        <canvas
          ref={canvasRef}
          className="wave"
          style={{ width: "100%" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      <div className="wavemeta">
        <span>{formatClock(playhead / SAMPLE_RATE)}</span>
        <span className="hint" style={{ margin: 0 }}>
          {hasSelection
            ? `Selected ${formatClock(selDuration)}`
            : "Drag across the wave to select · tap to move the playhead"}
        </span>
        <span>{formatDuration(duration)}</span>
      </div>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <button className="ghost small" onClick={togglePlay} disabled={disabled || !total}>
          {playing ? "■ Stop" : hasSelection ? "▶ Play selection" : "▶ Play"}
        </button>
        <button
          className="ghost small"
          onClick={() => apply(deleteRange(segments, selection[0], selection[1]))}
          disabled={disabled || !hasSelection}
        >
          Delete selection
        </button>
        <button
          className="ghost small"
          onClick={() => apply(cropRange(segments, selection[0], selection[1]))}
          disabled={disabled || !hasSelection}
        >
          Keep only selection
        </button>
        <button className="ghost small" onClick={undo} disabled={disabled || !history.length}>
          Undo
        </button>
        <button className="ghost small" onClick={exportMp3} disabled={disabled || exporting || !total}>
          {exporting ? "Saving…" : "Download MP3"}
        </button>
      </div>
    </div>
  );
}
