// Languages for the people app. English lives at the plain paths (/, /play),
// German under /de (/de, /de/play). proxy.ts maps the plain paths to the
// [lang] route. No React here, so shared lib files can import it too.

export type Lang = "en" | "de";

export const LANGS: readonly Lang[] = ["en", "de"];
export const DEFAULT_LANG: Lang = "en";

export const SITE = "https://grunroute-heilbronn-ebon.vercel.app";
export const SITE_NAME = "GrünRoute Heilbronn";

export const isLang = (v: unknown): v is Lang => v === "en" || v === "de";

/** Locale tag for numbers, dates, and speech. */
export const LOCALE: Record<Lang, string> = { en: "en-GB", de: "de-DE" };

/** Open Graph locale tag. */
export const OG_LOCALE: Record<Lang, string> = { en: "en_GB", de: "de_DE" };

/** Short name for the language switch. */
export const LANG_NAME: Record<Lang, string> = { en: "English", de: "Deutsch" };

/** Number in the format of the language, 2,281 in English and 2.281 in German. */
export const fmtNum = (n: number, lang: Lang = DEFAULT_LANG, opts?: Intl.NumberFormatOptions) =>
  n.toLocaleString(LOCALE[lang], opts);

/** Takes the language prefix off a path: /de/play to /play, /de to /. */
export function stripLang(path: string): string {
  const m = path.match(/^\/(en|de)(?=\/|$)/);
  if (!m) return path || "/";
  return path.slice(m[0].length) || "/";
}

/** The language a path is in, from its prefix. */
export const langOf = (path: string): Lang => (/^\/de(\/|$)/.test(path) ? "de" : "en");

/** Path in a given language: /play to /de/play for German, left as is for English. */
export function localePath(lang: Lang, path: string): string {
  const p = stripLang(path.startsWith("/") ? path : `/${path}`);
  if (lang === DEFAULT_LANG) return p;
  return p === "/" ? `/${lang}` : `/${lang}${p}`;
}
