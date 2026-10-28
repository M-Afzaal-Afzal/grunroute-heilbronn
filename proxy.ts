import { NextResponse, type NextRequest } from "next/server";

// Language routing. English pages live at the plain paths (/, /play) and are
// served from the [lang] route as /en. German pages live under /de.
// - /en/... redirects to the plain path, so each page has one English URL.
// - A plain path redirects to /de/... when the visitor chose German (cookie),
//   or, on a first visit with no choice yet, when the browser asks for German
//   before English. Link preview bots and search bots are never redirected,
//   so a shared link always shows the language of the link.

const COOKIE = "lang";
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|whatsapp|telegram|slack|discord|linkedin|twitter|pinterest|embedly|skype|vkshare|preview|lighthouse|headless/i;

/** True when the Accept-Language header ranks German above English. */
function prefersGerman(header: string | null): boolean {
  if (!header) return false;
  let de = -1;
  let en = -1;
  for (const part of header.split(",")) {
    const [tag, ...params] = part.trim().toLowerCase().split(";");
    const q = Number(params.find((p) => p.trim().startsWith("q="))?.trim().slice(2) ?? 1);
    const base = tag.split("-")[0];
    if (base === "de") de = Math.max(de, q);
    if (base === "en") en = Math.max(en, q);
  }
  return de > 0 && de > en;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Share images are linked with their full /en or /de path, serve them as is.
  if (/\/(opengraph|twitter)-image(\/|$)/.test(pathname) && /^\/(en|de)\//.test(pathname)) return NextResponse.next();

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    const res = NextResponse.redirect(url, 308);
    res.cookies.set(COOKIE, "en", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return res;
  }

  if (pathname === "/de" || pathname.startsWith("/de/")) return NextResponse.next();

  const chosen = request.cookies.get(COOKIE)?.value;
  const isBot = BOT.test(request.headers.get("user-agent") ?? "");
  if (!isBot && (chosen === "de" || (!chosen && prefersGerman(request.headers.get("accept-language"))))) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/de" : `/de${pathname}`;
    const res = NextResponse.redirect(url, 307);
    res.headers.set("Vary", "Accept-Language, Cookie");
    return res;
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/en" : `/en${pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  // Pages only: skip Next.js files, data, brand files, icons, the manifest,
  // robots.txt, sitemap.xml, and any path with a file extension.
  matcher: ["/((?!_next/|data/|brand/|api/|favicon\\.ico|icon\\.svg|apple-icon\\.png|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|.*\\.[a-zA-Z0-9]+$).*)"],
};
