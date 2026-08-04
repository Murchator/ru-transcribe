import { isAuthorized, unauthorized } from "@/lib/auth";
import { apiKey } from "@/lib/openai";
import { transcriptionPrompt } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Hobby caps this at 60s; Pro allows 300s.

const PRIMARY = process.env.TRANSCRIBE_MODEL || "gpt-transcribe";
const FALLBACK = "gpt-4o-transcribe";

export async function POST(request) {
  if (!isAuthorized(request)) return unauthorized();

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Couldn't read the upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ error: "No audio chunk received." }, { status: 400 });
  }

  const context = String(form.get("context") || "");
  const previousTail = String(form.get("previousTail") || "");
  let keywords = [];
  try {
    keywords = JSON.parse(String(form.get("keywords") || "[]"));
  } catch {}
  keywords = keywords
    .map((k) => String(k).replace(/[<>\r\n]/g, " ").trim())
    .filter(Boolean)
    .slice(0, 100);

  const prompt = transcriptionPrompt({ context, previousTail });

  try {
    let res = await callTranscribe(PRIMARY, file, prompt, keywords);

    // If the newer model isn't available on this account, quietly use the older one.
    if (!res.ok && (res.status === 404 || res.status === 400)) {
      const detail = await res.clone().text();
      if (/model/i.test(detail)) {
        res = await callTranscribe(FALLBACK, file, prompt, keywords);
      }
    }

    if (!res.ok) {
      const detail = await res.text();
      return Response.json(
        { error: `Transcription failed (${res.status}). ${shorten(detail)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return Response.json({ text: (data.text || "").trim() });
  } catch (err) {
    return Response.json({ error: err.message || "Transcription failed." }, { status: 500 });
  }
}

async function callTranscribe(model, file, prompt, keywords) {
  const fd = new FormData();
  fd.append("file", file, "chunk.mp3");
  fd.append("model", model);

  if (model === "gpt-transcribe" || model === "gpt-live-transcribe") {
    // Newer models take structured hints.
    fd.append("prompt", prompt.slice(0, 4000));
    fd.append("languages[]", "ru");
    for (const k of keywords) fd.append("keywords[]", k);
  } else {
    // Older models take a single free-text prompt and one language.
    // Fold the glossary into the prompt so we don't lose it.
    const withKeywords = keywords.length
      ? `${prompt} Возможные имена и термины: ${keywords.join(", ")}.`
      : prompt;
    fd.append("prompt", withKeywords.slice(0, 2000));
    fd.append("language", "ru");
  }

  return fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: fd,
  });
}

function shorten(s) {
  return String(s).replace(/\s+/g, " ").slice(0, 300);
}
