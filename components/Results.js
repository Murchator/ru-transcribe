"use client";

import { formatDuration } from "@/lib/audio";
import { plural } from "@/lib/ru";

export default function Results({ result, tab, setTab, level, fileName }) {
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
    // Both only exist when the text came from audio.
    if (id === "raw") return !!result.raw;
    if (id === "corrections") return !!result.raw;
    return true;
  });

  const active = tabs.some(([id]) => id === tab) ? tab : "transcript";
  const base = (fileName || "transcript").replace(/\.[^.]+$/, "");

  return (
    <div className="panel printable">
      <div className="toolbar">
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
      </p>

      <div className="tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={active === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {active === "transcript" && (
        <div className="transcript">
          {result.text.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

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
        <div>
          {result.notes.title && <h3 className="section">{result.notes.title}</h3>}
          <p>{result.notes.summary}</p>
          <List title="Темы" items={result.notes.topics} />
          <List title="Ключевые мысли" items={result.notes.keyPoints} />
          <List title="Вопросы для обсуждения" items={result.notes.discussionQuestions} />
        </div>
      )}

      {active === "vocab" && result.vocab && (
        <table>
          <thead>
            <tr>
              <th>Слово</th>
              <th>English</th>
              <th>Пример</th>
            </tr>
          </thead>
          <tbody>
            {(result.vocab.items || []).map((v, i) => (
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
      )}

      {active === "exercises" && result.exercises && (
        <div>
          <h3 className="section">Вставьте пропущенное слово</h3>
          <ol className="clean">
            {(result.exercises.gapFill || []).map((g, i) => (
              <li key={i}>
                {g.sentence} <span className="answer">({g.answer})</span>
              </li>
            ))}
          </ol>
          <h3 className="section">Вопросы по тексту</h3>
          <ol className="clean">
            {(result.exercises.comprehension || []).map((q, i) => (
              <li key={i}>
                {q.question} <span className="answer">— {q.answer}</span>
              </li>
            ))}
          </ol>
          <h3 className="section">Правда или неправда</h3>
          <ol className="clean">
            {(result.exercises.trueFalse || []).map((t, i) => (
              <li key={i}>
                {t.statement} <span className="answer">— {t.answer ? "правда" : "неправда"}</span>
              </li>
            ))}
          </ol>
          <h3 className="section">Говорение</h3>
          <ul className="clean">
            {(result.exercises.speaking || []).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function List({ title, items }) {
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

  if (r.exercises) {
    out.push(`## Упражнения\n`);
    if (r.exercises.gapFill?.length) {
      out.push(`### Вставьте пропущенное слово\n`);
      r.exercises.gapFill.forEach((g, i) => out.push(`${i + 1}. ${g.sentence}`));
      out.push(`\n_Ответы: ${r.exercises.gapFill.map((g) => g.answer).join(", ")}_\n`);
    }
    if (r.exercises.comprehension?.length) {
      out.push(`### Вопросы по тексту\n`);
      r.exercises.comprehension.forEach((q, i) => out.push(`${i + 1}. ${q.question}`));
      out.push(
        `\n_Ответы: ${r.exercises.comprehension.map((q, i) => `${i + 1}) ${q.answer}`).join("; ")}_\n`
      );
    }
    if (r.exercises.trueFalse?.length) {
      out.push(`### Правда или неправда\n`);
      r.exercises.trueFalse.forEach((t, i) => out.push(`${i + 1}. ${t.statement}`));
      out.push(
        `\n_Ответы: ${r.exercises.trueFalse
          .map((t, i) => `${i + 1}) ${t.answer ? "правда" : "неправда"}`)
          .join("; ")}_\n`
      );
    }
    if (r.exercises.speaking?.length) {
      out.push(`### Говорение\n\n${r.exercises.speaking.map((s) => `- ${s}`).join("\n")}\n`);
    }
  }

  if (r.corrections?.length) {
    out.push(`## Что было исправлено\n`);
    for (const c of r.corrections)
      out.push(`- ~~${c.from}~~ → **${c.to}**${c.why ? ` — ${c.why}` : ""}`);
  }

  return out.join("\n");
}
