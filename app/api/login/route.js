import { COOKIE, expectedPassword, safeEqual } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request) {
  const { password } = await request.json().catch(() => ({}));
  const expected = expectedPassword();

  if (expected && !safeEqual(String(password || ""), expected)) {
    // Small delay so the endpoint isn't a fast password oracle.
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({ error: "Wrong password." }, { status: 401 });
  }

  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": [
          `${COOKIE}=${encodeURIComponent(expected)}`,
          "Path=/",
          "HttpOnly",
          "SameSite=Lax",
          "Max-Age=2592000", // 30 days
          process.env.NODE_ENV === "production" ? "Secure" : "",
        ]
          .filter(Boolean)
          .join("; "),
      },
    }
  );
}

export async function GET(request) {
  const { isAuthorized } = await import("@/lib/auth");
  return Response.json({ authorized: isAuthorized(request) });
}
