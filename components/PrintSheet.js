"use client";

import { exerciseHeading, labels } from "@/lib/labels";
import { hasAnswers, typeById } from "@/lib/exercises";

/**
 * The worksheet, laid out for paper.
 *
 * Lives outside the tabbed interface on purpose: tabs only render the panel
 * you're looking at, so printing from them gave you one section. This renders
 * everything, hidden on screen, and the print stylesheet swaps them over.
 *
 * Exercises print without answers — a key goes on its own page at the end, so
 * a teacher can hand out the front sheets and keep the last one.
 */
export default function PrintSheet({ result, level }) {
  const L = labels(level);
  const sets = (result.exercises?.sets || []).filter((s) => s.items?.length);
  const keyed = sets.filter((s) => hasAnswers(s.type) && s.items.some((i) => i.a?.trim()));

  return (
    <div className="print-sheet">
      <h1>{result.notes?.title || L.text}</h1>
      <p className="meta">
        {L.level}: {level}
        {" · "}
        {result.text.trim().split(/\s+/).length} {L.words}
      </p>

      {result.notes?.summary && (
        <section>
          <h2>{L.summary}</h2>
          <p>{result.notes.summary}</p>
          <PrintList title={L.topics} items={result.notes.topics} inline />
          <PrintList title={L.keyPoints} items={result.notes.keyPoints} />
          <PrintList title={L.discussion} items={result.notes.discussionQuestions} numbered />
        </section>
      )}

      <section>
        <h2>{L.text}</h2>
        {result.text.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>

      {result.vocab?.items?.length > 0 && (
        <section>
          <h2>{L.vocabulary}</h2>
          <table>
            <thead>
              <tr>
                <th>{L.word}</th>
                <th>{L.translation}</th>
                <th>{L.example}</th>
              </tr>
            </thead>
            <tbody>
              {result.vocab.items.map((v, i) => (
                <tr key={i}>
                  <td>
                    <strong>{v.term}</strong>
                    {v.note ? <div className="sub">{v.note}</div> : null}
                  </td>
                  <td>{v.translation}</td>
                  <td>{v.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {sets.length > 0 && (
        <section>
          <h2>{L.exercises}</h2>
          {sets.map((set, si) => {
            const type = typeById(set.type);
            return (
              <div className="exset" key={si}>
                <h3>
                  {si + 1}. {type ? exerciseHeading(type, level) : set.type}
                </h3>
                {set.instruction && <p className="instruction">{set.instruction}</p>}
                <ol>
                  {set.items.map((item, i) => (
                    <li key={i}>
                      {item.q}
                      {hasAnswers(set.type) && <span className="writeline" />}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </section>
      )}

      {keyed.length > 0 && (
        <section className="answerkey">
          <h2>{L.answers}</h2>
          {keyed.map((set, si) => {
            const type = typeById(set.type);
            return (
              <p key={si}>
                <strong>{type ? exerciseHeading(type, level) : set.type}: </strong>
                {set.items.map((item, i) => `${i + 1}) ${item.a}`).join("  ")}
              </p>
            );
          })}
        </section>
      )}
    </div>
  );
}

function PrintList({ title, items, numbered, inline }) {
  if (!items?.length) return null;
  if (inline)
    return (
      <p>
        <strong>{title}:</strong> {items.join(", ")}
      </p>
    );
  const List = numbered ? "ol" : "ul";
  return (
    <>
      <h3>{title}</h3>
      <List>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </List>
    </>
  );
}
