import { isAuthorized, unauthorized } from "@/lib/auth";
import { chatVisionJSON } from "@/lib/openai";
import { composeSystemPrompt } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_IMAGES = 6;

export async function POST(request) {
  if (!isAuthorized(request)) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const { images = [], level = "B1", context = "", glossary = [] } = body;

  if (!Array.isArray(images) || images.length === 0) {
    return Response.json({ error: "No images received." }, { status: 400 });
  }
  if (images.length > MAX_IMAGES) {
    return Response.json(
      { error: `Please use ${MAX_IMAGES} images or fewer at a time.` },
      { status: 400 }
    );
  }
  if (!images.every((u) => typeof u === "string" && u.startsWith("data:image/"))) {
    return Response.json({ error: "Those didn't look like images." }, { status: 400 });
  }

  try {
    const result = await chatVisionJSON({
      system: composeSystemPrompt({ level, context, glossary }),
      user:
        images.length > 1
          ? `Вот ${images.length} изображения с урока, по порядку. Напиши рассказ и верни JSON.`
          : "Вот изображение с урока. Напиши рассказ и верни JSON.",
      images,
      temperature: 0.4,
    });

    if (!result?.text?.trim()) {
      throw new Error("The model didn't produce any text. Try a clearer screenshot.");
    }

    return Response.json({
      text: String(result.text).trim(),
      usedNotes: Array.isArray(result.usedNotes) ? result.usedNotes : [],
      unclear: Array.isArray(result.unclear) ? result.unclear : [],
    });
  } catch (err) {
    return Response.json({ error: err.message || "Couldn't read those images." }, { status: 500 });
  }
}
