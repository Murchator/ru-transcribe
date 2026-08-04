// A deliberately simple shared-password gate. Its job is to stop strangers who
// find the URL from spending your API credits — not to protect secrets.

export const COOKIE = "ru_transcribe_auth";

export function expectedPassword() {
  return process.env.APP_PASSWORD || "";
}

export function isAuthorized(request) {
  const expected = expectedPassword();
  if (!expected) return true; // no password configured -> open (fine for local dev)
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return false;
  return safeEqual(decodeURIComponent(match[1]), expected);
}

export function unauthorized() {
  return Response.json({ error: "Пожалуйста, войдите снова." }, { status: 401 });
}

export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
