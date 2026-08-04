"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/audio";

// Browsers disagree about container formats. Ask for the best one they'll admit
// to supporting; Safari on iPhone will land on mp4/aac, Chrome on webm/opus.
const CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of CANDIDATES) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return ""; // let the browser choose
}

// Browsers apply call-centre processing to microphones by default: noise
// suppression, automatic gain, echo cancellation. It's tuned for phone calls,
// and on a spoken monologue it dulls the voice and pumps the level — the
// "underwater" sound you get compared to Audacity, which records raw.
//
// So raw is the default here. The noise filter stays available for teachers
// working in a genuinely noisy room, where trading some clarity for less
// background hum is the right call.
const RAW_AUDIO = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

const FILTERED_AUDIO = {
  echoCancellation: false,
  noiseSuppression: true,
  autoGainControl: true,
};

export default function Recorder({ onFinish, disabled }) {
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [denoise, setDenoise] = useState(false);
  const [state, setState] = useState("idle"); // idle | recording | paused
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const startedAtRef = useRef(0);
  const accumulatedRef = useRef(0);
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
    }
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "audioinput"));
    } catch {
      /* ignore */
    }
  }, []);

  function cleanup() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close?.();
    audioCtxRef.current = null;
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
  }

  async function start() {
    setError("");
    chunksRef.current = [];
    accumulatedRef.current = 0;
    setElapsed(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          channelCount: 1,
          sampleRate: 48000,
          ...(denoise ? FILTERED_AUDIO : RAW_AUDIO),
        },
      });
      streamRef.current = stream;

      // Device labels are hidden until permission is granted, so list them now.
      refreshDevices();

      // Live level meter.
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3.2));
        if (recorderRef.current?.state === "recording") {
          setElapsed(accumulatedRef.current + (performance.now() - startedAtRef.current) / 1000);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      // Don't let the browser pick a thrifty default bitrate — this is the
      // master copy everything else is made from.
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000,
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        cleanup();
        setState("idle");
        setLevel(0);
        if (blob.size > 0) onFinish(blob, defaultName());
      };
      recorder.start(1000); // flush every second so nothing is lost on a crash
      startedAtRef.current = performance.now();
      setState("recording");

      // Stop the phone locking the screen mid-lesson.
      try {
        wakeLockRef.current = await navigator.wakeLock?.request("screen");
      } catch {
        /* not supported, no harm */
      }
    } catch (err) {
      cleanup();
      setState("idle");
      setError(
        err?.name === "NotAllowedError"
          ? "Доступ к микрофону запрещён. Разрешите его в адресной строке браузера и попробуйте снова."
          : err?.name === "NotFoundError"
            ? "Микрофон не найден."
            : `Не удалось начать запись: ${err?.message || err}`
      );
    }
  }

  function pause() {
    const r = recorderRef.current;
    if (r?.state !== "recording") return;
    r.pause();
    accumulatedRef.current += (performance.now() - startedAtRef.current) / 1000;
    setState("paused");
  }

  function resume() {
    const r = recorderRef.current;
    if (r?.state !== "paused") return;
    r.resume();
    startedAtRef.current = performance.now();
    setState("recording");
  }

  function stop() {
    recorderRef.current?.stop();
  }

  const canPause = typeof MediaRecorder !== "undefined" && !!MediaRecorder.prototype.pause;

  if (!supported) {
    return (
      <p className="hint">
        Этот браузер не умеет записывать звук. Используйте Chrome, Edge, Safari или Firefox — или
        загрузите готовый файл.
      </p>
    );
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}

      {state === "idle" ? (
        <>
          <label htmlFor="mic">Микрофон</label>
          <select
            id="mic"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            onFocus={refreshDevices}
          >
            <option value="">Микрофон по умолчанию</option>
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Микрофон ${i + 1}`}
              </option>
            ))}
          </select>
          {devices.length === 0 && (
            <p className="hint" style={{ marginTop: 8 }}>
              Названия микрофонов появятся после первой записи, когда вы разрешите доступ.
            </p>
          )}

          <div className="checkline">
            <input
              id="denoise"
              type="checkbox"
              checked={denoise}
              onChange={(e) => setDenoise(e.target.checked)}
            />
            <label htmlFor="denoise">Подавлять фоновый шум</label>
          </div>
          <p className="hint" style={{ marginTop: 4 }}>
            Обычно выключено: звук получается чище и естественнее. Включайте, только если в
            комнате шумно — голос станет глуше.
          </p>

          <div style={{ marginTop: 16 }}>
            <button onClick={start} disabled={disabled}>
              ● Начать запись
            </button>
          </div>
        </>
      ) : (
        <div className="recording">
          <div className="reclevel">
            <div style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <div className="recrow">
            <span className={`recdot${state === "recording" ? " live" : ""}`} />
            <strong className="rectime">{formatDuration(elapsed)}</strong>
            <span className="hint" style={{ margin: 0 }}>
              {state === "paused" ? "Пауза" : "Идёт запись…"}
            </span>
            <span style={{ flex: 1 }} />
            {canPause &&
              (state === "recording" ? (
                <button className="ghost small" onClick={pause}>
                  Пауза
                </button>
              ) : (
                <button className="ghost small" onClick={resume}>
                  Продолжить
                </button>
              ))}
            <button className="small" onClick={stop}>
              Стоп
            </button>
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            Говорите обычным голосом, на расстоянии 20–30 см от микрофона. Оговорки можно вырезать
            после остановки.
          </p>
        </div>
      )}
    </div>
  );
}

function defaultName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `Запись ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
}
