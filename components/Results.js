"use client";

import { useState } from "react";
import { formatDuration } from "@/lib/audio";
import { hasAnswers, typeById } from "@/lib/exercises";
import { isAdvanced } from "@/lib/labels";
import { plural } from "@/lib/ru";

/**
 * Everything the app produced, in tabs, with an edit mode.
 *
 * The teacher is the last word on all of it — a mistranscribed name, a wrong
 * translation, a clumsy exercise. `onChange` patches the result object held by
 * the page, so edits flow straight into the downloads and the printed sheet.
 */
export default function Results({ result, tab, setTab, level, fileName, onChange, onRegenerate, busy }) {
  const [editing, setEditing] = useState(false);

  const tabs = [
    ["transcript", "Текст"],
    ["corrections", `Исправления (${result.corrections.length})`],
    ["notes", "Конспект"],
    ["vocab", "Лексика"],
    ["exercises", "Упражнения"],
    ["raw", "Без обработки"],
  ].filter(([id]) => {
    if (id === "notes") return !!result.notes;
    if (id === "vocab") return !!result.vocab;
    if (id === "exercises") return !!result.exercises;
    if (id === "raw" || id === "corrections") return !!result.raw; // only from audio
    return true;
  });

  const active = tabs.some(([id]) => id === tab) ? tab : "transcript";
  const base = (fileName || "transcript").replace(/\.[^.]+$/, "");
  const edit = (patch) => onChange({ ...patch, edited: true });

  return (
    <div className="panel">
      <div className="toolbar">
        <button className="ghost small" onClick={() => setEditing((v) => !v)}>
          {editing ? "Готово" : "Править"}
        </button>
        <button className="ghost small" onClick={() => copy(result.text)}>
          Копировать текст
        </button>
        <button
          className="ghost small"
          onClick={() => download(`${base}.txt`, result.text, "text/plain")}
        >
          Скачать .txt
        </button>
        <button
          className="ghost small"
          onClick={() => download(`${base}.md`, toMarkdown(result, level), "text/markdown")}
        >
          Скачать всё (.md)
        </button>
        <button className="ghost small" onClick={() => window.print()}>
          Печать или PDF
        </button>
      </div>

      <p className="hint">
        {result.duration != null ? `${formatDuration(result.duration)} звука · ` : ""}
        {result.parts > 1 ? `${plural(result.parts, "часть", "части", "частей")} · ` : ""}
        {plural(result.text.trim().split(/\s+/).length, "слово", "слова", "слов")}
        {editing ? " · режим правки" : ""}
      </p>

      <div className="tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={active === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {result.edited && (result.notes || result.vocab || result.exercises) && (
        <div className="warn">
          Вы изменили материалы. Конспект, лексика и упражнения составлены по старому тексту.
          <div style={{ marginTop: 10 }}>
            <button className="small" onClick={onRegenerate} disabled={busy}>
              {busy ? "Обновляем…" : "Пересоздать по новому тексту"}
            </button>
          </div>
        </div>
      )}

      {active === "transcript" &&
        (editing ? (
          <>
            <textarea
              className="script"
              value={result.text}
              onChange={(e) => edit({ text: e.target.value })}
              spellCheck={false}
              autoFocus
            />
            <p className="hint">Пустая строка разделяет абзацы.</p>
          </>
        ) : (
          <div className="transcript">
            {result.text.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ))}

      {active === "raw" && <div className="transcript">{result.raw}</div>}

      {active === "corrections" && (
        <div className="corr">
          {result.corrections.length === 0 ? (
            <p className="hint">Существенных исправлений не понадобилось.</p>
          ) : (
            <ul className="clean">
              {result.corrections.map((c, i) => (
                <li key={i}>
                  <del>{c.from}</del> → <ins>{c.to}</ins>
                  {c.why ? <div className="why">{c.why}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {active === "notes" && result.notes && (
        <NotesTab
          notes={result.notes}
          editing={editing}
          onChange={(notes) => edit({ notes })}
        />
      )}

      {active === "vocab" && result.vocab && (
        <VocabTab
          vocab={result.vocab}
          editing={editing}
          onChange={(vocab) => edit({ vocab })}
        />
      )}

      {active === "exercises" && result.exercises && (
        <ExercisesTab
          exercises={result.exercises}
          level={level}
          editing={editing}
          onChange={(exercises) => edit({ exercises })}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- notes */

function NotesTab({ notes, editing, onChange }) {
  const set = (patch) => onChange({ ...notes, ...patch });

  if (!editing) {
    return (
      <div>
        {notes.title && <h3 className="section">{notes.title}</h3>}
        <p>{notes.summary}</p>
        <ReadList title="Темы" items={notes.topics} />
        <ReadList title="Ключевые мысли" items={notes.keyPoints} />
        <ReadList title="Вопросы для обсуждения" items={notes.discussionQuestions} />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="n-title">Название</label>
      <input
        id="n-title"
        type="text"
        value={notes.title || ""}
        onChange={(e) => set({ title: e.target.value })}
      />
      <div style={{ marginTop: 14 }}>
        <label htmlFor="n-sum">Краткое содержание</label>
        <textarea
          id="n-sum"
          value={notes.summary || ""}
          onChange={(e) => set({ summary: e.target.value })}
        />
      </div>
      <LinesField label="Темы" items={notes.topics} onChange={(topics) => set({ topics })} />
      <LinesField
        label="Ключевые мысли"
        items={notes.keyPoints}
        onChange={(keyPoints) => set({ keyPoints })}
      />
      <LinesField
        label="Вопросы для обсуждения"
        items={notes.discussionQuestions}
        onChange={(discussionQuestions) => set({ discussionQuestions })}
      />
    </div>
  );
}

/** A list edited as plain lines — far less fiddly than a row per item. */
function LinesField({ label, items, onChange }) {
  return (
    <div style={{ marginTop: 14 }}>
      <label>{label}</label>
      <textarea
        value={(items || []).join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n").filter((s) => s.trim()))}
      />
      <p className="hint" style={{ marginTop: 4 }}>
        По одному пункту в строке.
      </p>
    </div>
  );
}

function ReadList({ title, items }) {
  if (!items?.length) return null;
  return (
    <>
      <h3 className="section">{title}</h3>
      <ul className="clean">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </>
  );
}

/* ------------------------------------------------------------ vocabulary */

function VocabTab({ vocab, editing, onChange }) {
  const items = vocab.items || [];
  const setItems = (next) => onChange({ ...vocab, items: next });
  const patch = (i, p) => setItems(items.map((v, j) => (j === i ? { ...v, ...p } : v)));

  if (!editing) {
    return (
      <table>
        <thead>
          <tr>
            <th>Слово</th>
            <th>English</th>
            <th>Пример</th>
          </tr>
        </thead>
        <tbody>
          {items.map((v, i) => (
            <tr key={i}>
              <td className="term">
                {v.term}
                {v.pos ? <div className="note">{v.pos}</div> : null}
              </td>
              <td>
                {v.translation}
                {v.note ? <div className="note">{v.note}</div> : null}
              </td>
              <td>{v.example}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div>
      {items.map((v, i) => (
        <div className="editrow" key={i}>
          <input
            className="small"
            style={{ flex: "0 0 22%" }}
            value={v.term || ""}
            onChange={(e) => patch(i, { term: e.target.value })}
            placeholder="слово"
          />
          <input
            className="small"
            style={{ flex: "0 0 22%" }}
            value={v.translation || ""}
            onChange={(e) => patch(i, { translation: e.target.value })}
            placeholder="English"
          />
          <input
            className="small"
            value={v.example || ""}
            onChange={(e) => patch(i, { example: e.target.value })}
            placeholder="пример"
          />
          <button
            className="rowdel"
            onClick={() => setItems(items.filter((_, j) => j !== i))}
            aria-label="Удалить строку"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="ghost small"
        onClick={() => setItems([...items, { term: "", translation: "", example: "" }])}
      >
        + Добавить слово
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- exercises */

function ExercisesTab({ exercises, level, editing, onChange }) {
  const sets = exercises.sets || [];
  const beginner = !isAdvanced(level); // matches what the printed sheet will show
  const setSets = (next) => onChange({ ...exercises, sets: next });
  const patchSet = (si, p) => setSets(sets.map((s, j) => (j === si ? { ...s, ...p } : s)));
  const patchItem = (si, ii, p) =>
    patchSet(si, {
      items: sets[si].items.map((it, j) => (j === ii ? { ...it, ...p } : it)),
    });

  if (!sets.length) return <p className="hint">Упражнения не получились. Попробуйте ещё раз.</p>;

  return (
    <div>
      {sets.map((set, si) => {
        const type = typeById(set.type);
        const showAnswers = hasAnswers(set.type);
        return (
          <div key={si} className="editlist">
            <h3 className="section">{type ? type.ru : set.type}</h3>
            {editing ? (
              <div style={{ marginBottom: 10 }}>
                <input
                  className="small"
                  value={set.instruction || ""}
                  onChange={(e) => patchSet(si, { instruction: e.target.value })}
                  placeholder="инструкция по-русски"
                />
                <input
                  className="small"
                  style={{ marginTop: 6 }}
                  value={set.instructionEn || ""}
                  onChange={(e) => patchSet(si, { instructionEn: e.target.value })}
                  placeholder="instruction in English (A1–A2)"
                />
                <input
                  className="small"
                  style={{ marginTop: 6 }}
                  value={set.example || ""}
                  onChange={(e) => patchSet(si, { example: e.target.value })}
                  placeholder="образец: задание → ответ"
                />
              </div>
            ) : (
              <>
                {beginner
                  ? (set.instructionEn || set.instruction) && (
                      <p className="hint">{set.instructionEn || set.instruction}</p>
                    )
                  : set.instruction && <p className="hint">{set.instruction}</p>}
                {beginner && set.example && (
                  <p className="hint">
                    <strong>Example:</strong> {set.example}
                  </p>
                )}
              </>
            )}

            {editing ? (
              <>
                {(set.items || []).map((item, ii) => (
                  <div className="editrow" key={ii}>
                    <textarea
                      className="small"
                      value={item.q || ""}
                      onChange={(e) => patchItem(si, ii, { q: e.target.value })}
                      placeholder="задание"
                    />
                    {showAnswers && (
                      <input
                        className="small"
                        style={{ flex: "0 0 28%" }}
                        value={item.a || ""}
                        onChange={(e) => patchItem(si, ii, { a: e.target.value })}
                        placeholder="ответ"
                      />
                    )}
                    <button
                      className="rowdel"
                      onClick={() =>
                        patchSet(si, { items: set.items.filter((_, j) => j !== ii) })
                      }
                      aria-label="Удалить задание"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  className="ghost small"
                  onClick={() => patchSet(si, { items: [...(set.items || []), { q: "", a: "" }] })}
                >
                  + Добавить задание
                </button>
              </>
            ) : (
              <ol className="clean">
                {(set.items || []).map((item, ii) => (
                  <li key={ii}>
                    {item.q}
                    {showAnswers && item.a ? <span className="answer"> — {item.a}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
      <p className="hint">
        В PDF ответы печатаются отдельно, на последней странице.
        {beginner ? " Для A1–A2 задание печатается по-английски, с образцом." : ""}
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- helpers */

function copy(text) {
  navigator.clipboard?.writeText(text);
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function toMarkdown(r, level) {
  const out = [];
  out.push(r.notes?.title ? `# ${r.notes.title}\n` : `# Урок\n`);

  if (r.notes) {
    out.push(`## Конспект\n\n${r.notes.summary}\n`);
    if (r.notes.topics?.length) out.push(`**Темы:** ${r.notes.topics.join(", ")}\n`);
    if (r.notes.keyPoints?.length)
      out.push(`### Ключевые мысли\n\n${r.notes.keyPoints.map((k) => `- ${k}`).join("\n")}\n`);
    if (r.notes.discussionQuestions?.length)
      out.push(
        `### Вопросы для обсуждения\n\n${r.notes.discussionQuestions
          .map((q, i) => `${i + 1}. ${q}`)
          .join("\n")}\n`
      );
  }

  out.push(`## Текст\n\n${r.text}\n`);

  if (r.vocab?.items?.length) {
    out.push(`## Лексика (${level})\n`);
    out.push(`| Слово | English | Пример |`);
    out.push(`| --- | --- | --- |`);
    for (const v of r.vocab.items) {
      out.push(
        `| ${v.term}${v.note ? ` _(${v.note})_` : ""} | ${v.translation} | ${v.example || ""} |`
      );
    }
    out.push("");
  }

  const sets = (r.exercises?.sets || []).filter((s) => s.items?.length);
  if (sets.length) {
    out.push(`## Упражнения\n`);
    for (const set of sets) {
      const type = typeById(set.type);
      out.push(`### ${type ? type.ru : set.type}\n`);
      if (set.instruction) out.push(`_${set.instruction}_\n`);
      set.items.forEach((it, i) => out.push(`${i + 1}. ${it.q}`));
      out.push("");
    }
    // Answers last, so the sheet above can be handed out as it is.
    const keyed = sets.filter((s) => hasAnswers(s.type) && s.items.some((i) => i.a?.trim()));
    if (keyed.length) {
      out.push(`## Ключи\n`);
      for (const set of keyed) {
        const type = typeById(set.type);
        out.push(
          `**${type ? type.ru : set.type}:** ${set.items
            .map((it, i) => `${i + 1}) ${it.a}`)
            .join("  ")}\n`
        );
      }
    }
  }

  if (r.corrections?.length) {
    out.push(`## Что было исправлено\n`);
    for (const c of r.corrections)
      out.push(`- ~~${c.from}~~ → **${c.to}**${c.why ? ` — ${c.why}` : ""}`);
  }

  return out.join("\n");
}
