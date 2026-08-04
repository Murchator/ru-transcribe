import { isAuthorized, unauthorized } from "@/lib/auth";
import { chatJSON } from "@/lib/openai";
import { DEFAULT_TYPES, EXERCISE_TYPES, MAX_TYPES } from "@/lib/exercises";
import {
  correctionSystemPrompt,
  NOTES_SYSTEM,
  vocabSystem,
  exercisesSystem,
} from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

// Long transcripts are corrected in pieces. Too big and the model starts
// paraphrasing instead of correcting; this size keeps it faithful.
const CORRECTION_CHUNK_CHARS = 5000;

export async function POST(request) {
  if (!isAuthorized(request)) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const {
    task,
    text,
    glossary = [],
    level = "B1",
    removeFillers = true,
    exerciseTypes = [],
  } = body;

  if (!text || !String(text).trim()) {
    return Response.json({ error: "Нет текста для обработки." }, { status: 400 });
  }

  try {
    switch (task) {
      case "correct":
        return Response.json(await correct(String(text), glossary, removeFillers));
      case "notes":
        return Response.json(await chatJSON({ system: NOTES_SYSTEM, user: capped(text) }));
      case "vocab":
        return Response.json(await chatJSON({ system: vocabSystem(level), user: capped(text) }));
      case "exercises": {
        const chosen = exerciseTypes
          .map((id) => EXERCISE_TYPES.find((t) => t.id === id))
          .filter(Boolean)
          .slice(0, MAX_TYPES);
        const types = chosen.length
          ? chosen
          : EXERCISE_TYPES.filter((t) => DEFAULT_TYPES.includes(t.id));
        return Response.json(
          await chatJSON({
            system: exercisesSystem(level, types),
            user: capped(text),
            temperature: 0.5,
          })
        );
      }
      default:
        return Response.json({ error: `Неизвестная задача «${task}».` }, { status: 400 });
    }
  } catch (err) {
    return Response.json({ error: err.message || "Что-то пошло не так." }, { status: 500 });
  }
}

async function correct(text, glossary, removeFillers) {
  const system = correctionSystemPrompt({ glossary, removeFillers });
  const pieces = splitForCorrection(text);
  const out = [];
  const corrections = [];

  for (let i = 0; i < pieces.length; i++) {
    const tail = out.length ? lastWords(out[out.length - 1], 30) : "";
    const user = tail
      ? `Предыдущий фрагмент закончился так: «…${tail}»\n\nИсправь следующий фрагмент и верни JSON:\n\n${pieces[i]}`
      : `Исправь текст и верни JSON:\n\n${pieces[i]}`;

    const result = await chatJSON({ system, user, temperature: 0.1 });
    out.push(String(result.text || pieces[i]).trim());
    if (Array.isArray(result.corrections)) corrections.push(...result.corrections);
  }

  return {
    text: out.join("\n\n"),
    corrections: corrections.filter((c) => c && c.from && c.to && c.from !== c.to),
  };
}

/** Split on paragraph, then sentence boundaries — never mid-sentence. */
function splitForCorrection(text) {
  if (text.length <= CORRECTION_CHUNK_CHARS) return [text];

  const units = text
    .split(/\n{2,}/)
    .flatMap((p) => (p.length > CORRECTION_CHUNK_CHARS ? p.match(/[^.!?…]+[.!?…]+\s*/g) || [p] : [p]));

  const chunks = [];
  let current = "";
  for (const unit of units) {
    if (current && current.length + unit.length > CORRECTION_CHUNK_CHARS) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + unit;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function lastWords(s, n) {
  return s.trim().split(/\s+/).slice(-n).join(" ");
}

function capped(text) {
  // Notes/vocab/exercises only need to see the material, not every last word of
  // a three-hour recording.
  const limit = 60000;
  return text.length > limit ? text.slice(0, limit) + "\n\n[…]" : text;
}
