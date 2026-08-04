// Utility endpoint: visit /api/models in your browser to see which models your
// OpenAI account can actually use, so you can set TEXT_MODEL confidently.

import { isAuthorized, unauthorized } from "@/lib/auth";
import { apiKey, textModel } from "@/lib/openai";

export const runtime = "nodejs";

export async function GET(request) {
  if (!isAuthorized(request)) return unauthorized();

  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    return Response.json({ error: await res.text() }, { status: res.status });
  }
  const data = await res.json();
  const ids = (data.data || []).map((m) => m.id).sort();

  return Response.json({
    currentTextModel: textModel(),
    currentTranscribeModel: process.env.TRANSCRIBE_MODEL || "gpt-transcribe",
    transcription: ids.filter((id) => /transcribe|whisper/.test(id)),
    text: ids.filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/transcribe|whisper|tts|audio|image|realtime|embedding/.test(id)),
  });
}
