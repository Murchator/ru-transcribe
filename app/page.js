"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NotesComposer from "@/components/NotesComposer";
import Recorder from "@/components/Recorder";
import PrintSheet from "@/components/PrintSheet";
import Results from "@/components/Results";
import WaveformEditor from "@/components/WaveformEditor";
import {
  decodeAudio,
  encodeForTranscription,
  findChunkBoundaries,
  fullSegments,
  segmentsLength,
} from "@/lib/audio";
import { DEFAULT_TYPES, EXERCISE_TYPES, MAX_TYPES } from "@/lib/exercises";
import { plural } from "@/lib/ru";

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
    else setError("Неверный пароль.");
  }

  return (
    <div className="wrap">
      <form className="panel login" onSubmit={submit}>
        <h2>Вход</h2>
        <p className="hint">Введите пароль, который вам дали.</p>
        {error && <div className="error">{error}</div>}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="Пароль"
        />
        <div style={{ marginTop: 14 }}>
          <button disabled={busy || !password}>{busy ? "Проверяем…" : "Войти"}</button>
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
  const [exerciseTypes, setExerciseTypes] = useState(DEFAULT_TYPES);

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
      const { pcm, rate } = await decodeAudio(blob, setPreparing);
      if (!pcm.length) throw new Error("Эта запись пустая.");
      setSource({ name, pcm, rate });
      setSegments(fullSegments(pcm));
    } catch (err) {
      setError(err.message || "Не удалось прочитать этот звук.");
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
      setError(err.message || "Не удалось прочитать заметки.");
    } finally {
      setComposing(false);
    }
  }

  /* ---------------------------------------------------------- pipelines */

  /** Notes, vocabulary and exercises from a finished text. */
  async function addMaterials(base, force = false) {
    if (!makeExtras && !force) return base;
    setStatus("Составляем конспект, лексику и упражнения…");
    const [notes, vocab, exercises] = await Promise.all([
      post("/api/enhance", { task: "notes", text: base.text, level }).catch(() => null),
      post("/api/enhance", { task: "vocab", text: base.text, level }).catch(() => null),
      post("/api/enhance", { task: "exercises", text: base.text, level, exerciseTypes }).catch(
        () => null
      ),
    ]);
    return { ...base, notes, vocab, exercises, edited: false };
  }

  /** The teacher corrected something — text, notes, vocabulary or exercises. */
  function patchResult(patch) {
    setResult((r) => (r ? { ...r, ...patch } : r));
  }

  /** Rebuild notes/vocabulary/exercises from the corrected text. */
  async function regenerateMaterials() {
    if (!result) return;
    setRunning(true);
    setError("");
    try {
      setResult(await addMaterials(result, true));
      setStatus("Готово.");
    } catch (err) {
      setError(err.message || "Что-то пошло не так.");
    } finally {
      setRunning(false);
    }
  }

  /** Audio -> transcript -> correction -> materials. */
  async function runAudio() {
    if (!source || !segments) return;
    setRunning(true);
    setError("");
    setResult(null);
    setPercent(0);

    try {
      const { pcm, rate } = source;
      const duration = segmentsLength(segments) / rate;
      const ranges = findChunkBoundaries(pcm, segments, rate);

      // Transcribe piece by piece, feeding each piece the tail of the last one
      // so the model keeps its bearings across the seams.
      const pieces = [];
      for (let i = 0; i < ranges.length; i++) {
        const [from, to] = ranges[i];
        setStatus(
          ranges.length > 1
            ? `Расшифровываем часть ${i + 1} из ${ranges.length}…`
            : "Расшифровываем…"
        );
        setPercent(Math.round((i / ranges.length) * 65));

        const blob = await encodeForTranscription(pcm, rate, segments, from, to);
        const fd = new FormData();
        fd.append("file", blob, `part-${i + 1}.mp3`);
        fd.append("context", context);
        fd.append("keywords", JSON.stringify(glossaryTerms));
        fd.append("previousTail", pieces.length ? lastWords(pieces[pieces.length - 1], 40) : "");

        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Не удалось расшифровать.");
        pieces.push(data.text);
      }

      const raw = pieces.join(" ").replace(/\s+/g, " ").trim();
      if (!raw) throw new Error("В этой записи не найдено речи.");

      // The correction pass — what turns raw output into a usable transcript.
      setStatus("Исправляем ошибки распознавания и пунктуацию…");
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
      setStatus("Готово.");
      setTab("transcript");
    } catch (err) {
      setError(err.message || "Что-то пошло не так.");
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
      setStatus("Готово.");
      setTab("transcript");
    } catch (err) {
      setError(err.message || "Что-то пошло не так.");
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
          Запишите аудио, загрузите файл или превратите картинки с урока в рассказ — а потом
          получите конспект, лексику и упражнения.
        </p>
      </header>

      {error && <div className="error">{error}</div>}

      {/* ---------------------------------------------------------- source */}
      <div className="panel">
        <h2>{++n}. С чего начинаем урок</h2>

        <div className="segmented">
          <button
            className={mode === "record" ? "active" : ""}
            onClick={() => switchMode("record")}
            disabled={busy}
          >
            Запись
          </button>
          <button
            className={mode === "upload" ? "active" : ""}
            onClick={() => switchMode("upload")}
            disabled={busy}
          >
            Загрузить аудио
          </button>
          <button
            className={mode === "notes" ? "active" : ""}
            onClick={() => switchMode("notes")}
            disabled={busy}
          >
            По заметкам с урока
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
              <strong>Перетащите аудиофайл сюда или нажмите, чтобы выбрать</strong>
              <span>MP3, M4A, WAV, MP4, OGG. Длинные записи тоже подойдут.</span>
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
                Убрать
              </button>
            </div>
            <p className="hint">Вырежьте неудачные места, прежде чем продолжить.</p>
            <WaveformEditor
              pcm={source.pcm}
              rate={source.rate}
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
        <h2>{++n}. Об этом уроке</h2>
        <p className="hint">
          Необязательно, но именно это даёт лучший результат. Имена, названия, термины — по одному
          в строке.
        </p>
        <textarea
          value={glossary}
          onChange={(e) => setGlossary(e.target.value)}
          placeholder={"Бильбо Бэггинс\nчайка\nсушёная рыба\nВладивосток"}
        />
        <div style={{ marginTop: 14 }}>
          <label htmlFor="ctx">О чём этот урок?</label>
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
            <label htmlFor="level">Уровень ученика</label>
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
              Убирать слова-паразиты и оговорки («вот», «значит», повторы)
            </label>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------- narration */}
      {hasScript && (
        <div className="panel">
          <h2>{++n}. Ваш рассказ</h2>
          <p className="hint">
            Написан по вашим заметкам так, чтобы его было удобно читать вслух. Правьте как хотите
            — ничего не начнётся, пока вы не нажмёте кнопку ниже.
          </p>

          {unclear.length > 0 && (
            <div className="warn">
              <strong>Не удалось разобрать эти места в заметках:</strong>
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
          <p className="hint">
            {plural(script.trim().split(/\s+/).length, "слово", "слова", "слов")}
          </p>

          <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
            <button className="ghost small" onClick={compose} disabled={busy}>
              {composing ? "Переписываем…" : "Переписать заново"}
            </button>
            <button
              className="ghost small"
              onClick={() => setRecordingScript((v) => !v)}
              disabled={busy}
            >
              {recordingScript ? "Скрыть запись" : "Записать аудио к этому тексту"}
            </button>
            <button className="ghost small" onClick={() => copy(script)}>
              Копировать
            </button>
          </div>

          {recordingScript && (
            <div className="editor">
              <p className="hint">
                Прочитайте текст выше вслух. Потом можно вырезать лишнее и скачать MP3 для
                учеников.
              </p>
              {!source && <Recorder onFinish={load} disabled={busy} />}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------- create */}
      <div className="panel">
        <h2>{++n}. Создать материалы</h2>
        <div className="checkline">
          <input
            id="extras"
            type="checkbox"
            checked={makeExtras}
            onChange={(e) => setMakeExtras(e.target.checked)}
          />
          <label htmlFor="extras">Сделать конспект, список лексики и упражнения</label>
        </div>

        {makeExtras && (
          <div style={{ marginTop: 16 }}>
            <label>Какие упражнения нужны?</label>
            <p className="hint" style={{ marginBottom: 0 }}>
              По 5 заданий каждого вида. Не больше {MAX_TYPES} видов за раз — иначе на каждый
              останется слишком мало.
            </p>
            <div className="typegrid">
              {EXERCISE_TYPES.map((type) => {
                const on = exerciseTypes.includes(type.id);
                const full = exerciseTypes.length >= MAX_TYPES && !on;
                return (
                  <div className={`checkline${full ? " off" : ""}`} key={type.id}>
                    <input
                      id={`ex-${type.id}`}
                      type="checkbox"
                      checked={on}
                      disabled={full}
                      onChange={() =>
                        setExerciseTypes(
                          on
                            ? exerciseTypes.filter((x) => x !== type.id)
                            : [...exerciseTypes, type.id]
                        )
                      }
                    />
                    <label htmlFor={`ex-${type.id}`}>{type.ru}</label>
                  </div>
                );
              })}
            </div>
            {exerciseTypes.length === 0 && (
              <p className="hint">Ничего не выбрано — упражнений не будет.</p>
            )}
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          {hasScript ? (
            <button onClick={runScript} disabled={busy || !script.trim()}>
              {running ? "Работаем…" : "Использовать этот текст"}
            </button>
          ) : mode === "notes" ? (
            <p className="hint" style={{ margin: 0 }}>
              Добавьте картинки с урока выше и нажмите <strong>«Написать рассказ»</strong>.
            </p>
          ) : (
            <button onClick={runAudio} disabled={!source || busy}>
              {running ? "Работаем…" : "Расшифровать"}
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
          onChange={patchResult}
          onRegenerate={regenerateMaterials}
          busy={busy}
        />
      )}

      {result && <PrintSheet result={result} level={level} />}

      <p className="footnote">
        Звук и картинки обрабатываются в вашем браузере и отправляются в OpenAI только для
        распознавания и написания текста. На сервере ничего не сохраняется — скачайте то, что
        хотите оставить.
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
  if (!res.ok) throw new Error(data.error || "Запрос не удался.");
  return data;
}

function lastWords(s, n) {
  return s.trim().split(/\s+/).slice(-n).join(" ");
}

function copy(text) {
  navigator.clipboard?.writeText(text);
}
