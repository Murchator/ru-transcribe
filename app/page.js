"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NotesComposer from "@/components/NotesComposer";
import Recorder from "@/components/Recorder";
import Results from "@/components/Results";
import WaveformEditor from "@/components/WaveformEditor";
import {
  SAMPLE_RATE,
  decodeToMono16k,
  encodeMp3,
  findChunkBoundaries,
  fullSegments,
  segmentsLength,
} from "@/lib/audio";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

export default function Page() {
  const [authorized, setAuthorized] = useState(null);

  useEffect(() => {
    fetch("/api/login")
      .then((r) => r.json())
      .then((d) => setAuthorized(!!d.authorized))
      .catch(() => setAuthorized(false));
  }, []);

  if (authorized === null) return <div className="wrap" />;
  if (!authorized) return <Login onSuccess={() => setAuthorized(true)} />;
  return <App />;
}

/* ------------------------------------------------------------------ login */

function Login({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) onSuccess();
    else setError("That password isn't right.");
  }

  return (
    <div className="wrap">
      <form className="panel login" onSubmit={submit}>
        <h2>Sign in</h2>
        <p className="hint">Enter the password you were given.</p>
        {error && <div className="error">{error}</div>}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="Password"
        />
        <div style={{ marginTop: 14 }}>
          <button disabled={busy || !password}>{busy ? "Checking…" : "Continue"}</button>
        </div>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------- app */

function App() {
  const [mode, setMode] = useState("record"); // record | upload | notes

  // Lesson context — feeds both the transcriber and the narration writer.
  const [glossary, setGlossary] = useState("");
  const [context, setContext] = useState("");
  const [level, setLevel] = useState("B1");
  const [removeFillers, setRemoveFillers] = useState(true);
  const [makeExtras, setMakeExtras] = useState(true);

  // Audio
  const [source, setSource] = useState(null); // { name, pcm }
  const [segments, setSegments] = useState(null);
  const [preparing, setPreparing] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // Notes -> narration
  const [images, setImages] = useState([]);
  const [composing, setComposing] = useState(false);
  const [script, setScript] = useState(null); // edited narration text
  const [unclear, setUnclear] = useState([]);
  const [recordingScript, setRecordingScript] = useState(false);

  const [status, setStatus] = useState("");
  const [percent, setPercent] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const [result, setResult] = useState(null);
  const [tab, setTab] = useState("transcript");
  const inputRef = useRef(null);

  const glossaryTerms = glossary
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const busy = running || composing || !!preparing;

  function switchMode(next) {
    setMode(next);
    setError("");
  }

  /* ------------------------------------------------------------- audio in */

  const load = useCallback(async (blob, name) => {
    if (!blob) return;
    setError("");
    setSource(null);
    setSegments(null);
    try {
      const pcm = await decodeToMono16k(blob, setPreparing);
      if (!pcm.length) throw new Error("That recording is empty.");
      setSource({ name, pcm });
      setSegments(fullSegments(pcm));
    } catch (err) {
      setError(err.message || "Couldn't read that audio.");
    } finally {
      setPreparing("");
    }
  }, []);

  /* ------------------------------------------------- notes -> narration */

  async function compose() {
    if (!images.length) return;
    setComposing(true);
    setError("");
    setResult(null);
    try {
      const data = await post("/api/compose", {
        images: images.map((i) => i.dataUrl),
        level,
        context,
        glossary: glossaryTerms,
      });
      setScript(data.text);
      setUnclear(data.unclear || []);
      setRecordingScript(false);
      setSource(null);
      setSegments(null);
    } catch (err) {
      setError(err.message || "Couldn't read those notes.");
    } finally {
      setComposing(false);
    }
  }

  /* ---------------------------------------------------------- pipelines */

  /** Notes, vocabulary and exercises from a finished text. */
  async function addMaterials(base) {
    if (!makeExtras) return base;
    setStatus("Writing notes, vocabulary and exercises…");
    const [notes, vocab, exercises] = await Promise.all([
      post("/api/enhance", { task: "notes", text: base.text, level }).catch(() => null),
      post("/api/enhance", { task: "vocab", text: base.text, level }).catch(() => null),
      post("/api/enhance", { task: "exercises", text: base.text, level }).catch(() => null),
    ]);
    return { ...base, notes, vocab, exercises };
  }

  /** Audio -> transcript -> correction -> materials. */
  async function runAudio() {
    if (!source || !segments) return;
    setRunning(true);
    setError("");
    setResult(null);
    setPercent(0);

    try {
      const { pcm } = source;
      const duration = segmentsLength(segments) / SAMPLE_RATE;
      const ranges = findChunkBoundaries(pcm, segments);

      // Transcribe piece by piece, feeding each piece the tail of the last one
      // so the model keeps its bearings across the seams.
      const pieces = [];
      for (let i = 0; i < ranges.length; i++) {
        const [from, to] = ranges[i];
        setStatus(
          ranges.length > 1 ? `Transcribing part ${i + 1} of ${ranges.length}…` : "Transcribing…"
        );
        setPercent(Math.round((i / ranges.length) * 65));

        const blob = await encodeMp3(pcm, segments, from, to);
        const fd = new FormData();
        fd.append("file", blob, `part-${i + 1}.mp3`);
        fd.append("context", context);
        fd.append("keywords", JSON.stringify(glossaryTerms));
        fd.append("previousTail", pieces.length ? lastWords(pieces[pieces.length - 1], 40) : "");

        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Transcription failed.");
        pieces.push(data.text);
      }

      const raw = pieces.join(" ").replace(/\s+/g, " ").trim();
      if (!raw) throw new Error("No speech was found in this recording.");

      // The correction pass — what turns raw output into a usable transcript.
      setStatus("Correcting mishearings and punctuation…");
      setPercent(72);
      const corrected = await post("/api/enhance", {
        task: "correct",
        text: raw,
        glossary: glossaryTerms,
        removeFillers,
      });

      const base = {
        duration,
        parts: ranges.length,
        raw,
        text: corrected.text,
        corrections: corrected.corrections || [],
      };
      setResult(base);
      setPercent(makeExtras ? 80 : 100);

      setResult(await addMaterials(base));
      setPercent(100);
      setStatus("Done.");
      setTab("transcript");
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setStatus("");
    } finally {
      setRunning(false);
    }
  }

  /** Written narration -> materials. No transcription, nothing to correct. */
  async function runScript() {
    setRunning(true);
    setError("");
    setResult(null);
    setPercent(makeExtras ? 30 : 100);
    try {
      const base = { text: script.trim(), raw: null, corrections: [], duration: null, parts: 1 };
      setResult(await addMaterials(base));
      setPercent(100);
      setStatus("Done.");
      setTab("transcript");
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setStatus("");
    } finally {
      setRunning(false);
    }
  }

  /* ----------------------------------------------------------------- ui */

  const hasScript = mode === "notes" && script !== null;
  const showAudioEditor = source && segments && (mode !== "notes" || recordingScript);
  let n = 0;

  return (
    <div className="wrap">
      <header className="site">
        <h1>Расшифровка уроков</h1>
        <p>
          Record audio, upload a file, or turn your marked-up class pictures into a narration —
          then get notes, vocabulary and exercises.
        </p>
      </header>

      {error && <div className="error">{error}</div>}

      {/* ---------------------------------------------------------- source */}
      <div className="panel">
        <h2>{++n}. Where does this lesson start?</h2>

        <div className="segmented">
          <button
            className={mode === "record" ? "active" : ""}
            onClick={() => switchMode("record")}
            disabled={busy}
          >
            Record
          </button>
          <button
            className={mode === "upload" ? "active" : ""}
            onClick={() => switchMode("upload")}
            disabled={busy}
          >
            Upload audio
          </button>
          <button
            className={mode === "notes" ? "active" : ""}
            onClick={() => switchMode("notes")}
            disabled={busy}
          >
            From class notes
          </button>
        </div>

        {mode === "record" && <Recorder onFinish={load} disabled={busy} />}

        {mode === "upload" && (
          <>
            <div
              className={`drop${dragOver ? " over" : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) load(f, f.name);
              }}
            >
              <strong>Drop an audio file here, or click to choose</strong>
              <span>MP3, M4A, WAV, MP4, OGG. Long recordings are fine.</span>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="audio/*,video/mp4,video/webm"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) load(f, f.name);
                e.target.value = "";
              }}
            />
          </>
        )}

        {mode === "notes" && (
          <NotesComposer
            images={images}
            setImages={setImages}
            onCompose={compose}
            busy={composing}
            disabled={running}
          />
        )}

        {preparing && (
          <p className="hint" style={{ marginTop: 12 }}>
            {preparing}
          </p>
        )}

        {showAudioEditor && (
          <div className="editor">
            <div className="editorhead">
              <strong>{source.name}</strong>
              <button
                className="ghost small"
                onClick={() => {
                  setSource(null);
                  setSegments(null);
                }}
                disabled={busy}
              >
                Discard
              </button>
            </div>
            <p className="hint">Cut out false starts or mistakes before you go on.</p>
            <WaveformEditor
              pcm={source.pcm}
              segments={segments}
              onChange={setSegments}
              disabled={busy}
              exportName={source.name}
            />
          </div>
        )}
      </div>

      {/* --------------------------------------------------- lesson context */}
      <div className="panel">
        <h2>{++n}. About this lesson</h2>
        <p className="hint">
          Optional, but this is what makes the difference. Names, places, book titles and subject
          terms — one per line.
        </p>
        <textarea
          value={glossary}
          onChange={(e) => setGlossary(e.target.value)}
          placeholder={"Бильбо Бэггинс\nчайка\nсушёная рыба\nВладивосток"}
        />
        <div style={{ marginTop: 14 }}>
          <label htmlFor="ctx">What is this lesson about?</label>
          <input
            id="ctx"
            type="text"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Например: Маша спасает муху из лужи — глаголы движения, B1"
          />
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <div style={{ flex: "0 0 160px" }}>
            <label htmlFor="level">Student level</label>
            <select id="level" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        {mode !== "notes" && (
          <div className="checkline">
            <input
              id="fillers"
              type="checkbox"
              checked={removeFillers}
              onChange={(e) => setRemoveFillers(e.target.checked)}
            />
            <label htmlFor="fillers">
              Remove filler words and false starts («вот», «значит», repeats)
            </label>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------- narration */}
      {hasScript && (
        <div className="panel">
          <h2>{++n}. Your narration</h2>
          <p className="hint">
            Written from your notes, in a style meant to be read aloud. Edit it freely — nothing
            uses it until you press a button below.
          </p>

          {unclear.length > 0 && (
            <div className="warn">
              <strong>Couldn&apos;t read these bits of your notes:</strong>
              <ul className="clean" style={{ marginTop: 6, marginBottom: 0 }}>
                {unclear.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}

          <textarea
            className="script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            spellCheck={false}
          />
          <p className="hint">{script.trim().split(/\s+/).length} words</p>

          <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
            <button className="ghost small" onClick={compose} disabled={busy}>
              {composing ? "Rewriting…" : "Rewrite from notes"}
            </button>
            <button
              className="ghost small"
              onClick={() => setRecordingScript((v) => !v)}
              disabled={busy}
            >
              {recordingScript ? "Hide recorder" : "Record audio for this text"}
            </button>
            <button className="ghost small" onClick={() => copy(script)}>
              Copy
            </button>
          </div>

          {recordingScript && (
            <div className="editor">
              <p className="hint">
                Read the text above out loud. When you&apos;re done you can trim it and download
                the MP3 for your students.
              </p>
              {!source && <Recorder onFinish={load} disabled={busy} />}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------- create */}
      <div className="panel">
        <h2>{++n}. Create</h2>
        <div className="checkline">
          <input
            id="extras"
            type="checkbox"
            checked={makeExtras}
            onChange={(e) => setMakeExtras(e.target.checked)}
          />
          <label htmlFor="extras">Make notes, a vocabulary list and exercises</label>
        </div>

        <div style={{ marginTop: 18 }}>
          {hasScript ? (
            <button onClick={runScript} disabled={busy || !script.trim()}>
              {running ? "Working…" : "Use this text"}
            </button>
          ) : mode === "notes" ? (
            <p className="hint" style={{ margin: 0 }}>
              Add your class pictures above and press <strong>Write the narration</strong> first.
            </p>
          ) : (
            <button onClick={runAudio} disabled={!source || busy}>
              {running ? "Working…" : "Transcribe"}
            </button>
          )}
        </div>

        {(running || status) && (
          <div className="progress">
            <div className="bar">
              <div style={{ width: `${percent}%` }} />
            </div>
            <p>{status}</p>
          </div>
        )}
      </div>

      {result && (
        <Results
          result={result}
          tab={tab}
          setTab={setTab}
          level={level}
          fileName={source?.name || "lesson"}
        />
      )}

      <p className="footnote">
        Audio and images are processed in your browser and sent to OpenAI only for transcription
        and writing. Nothing is stored on the server.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- helpers */

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function lastWords(s, n) {
  return s.trim().split(/\s+/).slice(-n).join(" ");
}

function copy(text) {
  navigator.clipboard?.writeText(text);
}
