// Thin wrapper over the OpenAI HTTP API. No SDK on purpose: fewer moving parts,
// nothing to break when the SDK bumps a major version.

const BASE = "https://api.openai.com/v1";

export function apiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("На сервере не задан OPENAI_API_KEY.");
  return key;
}

export function textModel() {
  return process.env.TEXT_MODEL || "gpt-4.1";
}

/** Reading handwriting and small annotations needs a model that sees images. */
export function visionModel() {
  return process.env.VISION_MODEL || textModel();
}

/**
 * Call chat completions. Retries without `temperature` if the model rejects it
 * (newer reasoning models don't accept it), so this keeps working when you
 * upgrade TEXT_MODEL.
 */
export async function complete({ model, messages, json = false, temperature = 0.2 }) {
  const body = { model, messages };
  if (json) body.response_format = { type: "json_object" };
  if (temperature !== null) body.temperature = temperature;

  let res = await post("/chat/completions", body);

  if (!res.ok && res.status === 400) {
    const detail = await res.clone().text();
    if (/temperature/i.test(detail)) {
      delete body.temperature;
      res = await post("/chat/completions", body);
    }
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Ошибка модели (${res.status}): ${trim(detail)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export function chat({ system, user, ...rest }) {
  return complete({
    model: textModel(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...rest,
  });
}

/** Same, but with images attached. `images` are data URLs. */
export function chatVision({ system, user, images = [], ...rest }) {
  const content = [{ type: "text", text: user }];
  for (const url of images) {
    // "high" detail matters here — the whole point is reading small annotations.
    content.push({ type: "image_url", image_url: { url, detail: "high" } });
  }
  return complete({
    model: visionModel(),
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    ...rest,
  });
}

export async function chatJSON(args) {
  return parseJSON(await chat({ ...args, json: true }));
}

export async function chatVisionJSON(args) {
  return parseJSON(await chatVision({ ...args, json: true }));
}

function parseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    // Very occasionally a model wraps JSON in a code fence. Recover instead of failing.
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Модель вернула ответ в неправильном формате.");
  }
}

function post(path, body) {
  return fetch(BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify(body),
  });
}

function trim(s) {
  return String(s).slice(0, 400);
}
