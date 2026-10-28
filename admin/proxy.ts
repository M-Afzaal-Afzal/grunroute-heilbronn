import { NextResponse, type NextRequest } from "next/server";

// HTTP Basic Auth, only when ADMIN_USER and ADMIN_PASSWORD are set (Vercel
// dashboard, never in files). Without them the Planner runs in demo mode with
// public data only. Not real security: a city rollout needs SSO.
export function proxy(request: NextRequest) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [u, ...rest] = atob(header.slice(6)).split(":");
      if (safeEqual(u, user) && safeEqual(rest.join(":"), pass)) return NextResponse.next();
    } catch {
      /* bad header, fall through to 401 */
    }
  }
  return new NextResponse("Login needed for GrünRoute Planner.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="GrunRoute Planner", charset="UTF-8"', "X-Robots-Tag": "noindex" },
  });
}

/** Compares in time that does not depend on where the strings differ. */
function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = {
  // The app manifest, its icons and the service worker stay public, so the Planner
  // can be installed: browsers fetch them without the login.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|icons/).*)"],
};
