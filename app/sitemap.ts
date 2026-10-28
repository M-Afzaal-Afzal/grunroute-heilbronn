import type { MetadataRoute } from "next";
import { LANGS, SITE, localePath } from "../lib/i18n";
import { PAGE_PATH } from "../lib/seo";

// Every page in English and German, each with links to its other language.
export default function sitemap(): MetadataRoute.Sitemap {
  const abs = (p: string) => SITE + (p === "/" ? "" : p);
  return LANGS.flatMap((lang) =>
    Object.values(PAGE_PATH).map((path) => ({
      url: abs(localePath(lang, path)),
      changeFrequency: "weekly" as const,
      priority: path === "/" ? 1 : 0.7,
      alternates: {
        languages: { ...Object.fromEntries(LANGS.map((l) => [l, abs(localePath(l, path))])), "x-default": abs(path) },
      },
    })),
  );
}
