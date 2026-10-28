// Page titles, descriptions, and share tags in both languages. Every page
// builds its metadata here, so the canonical link, the hreflang links, and
// the Open Graph and X (Twitter) tags always match.
import type { Metadata } from "next";
import { LANGS, OG_LOCALE, SITE, SITE_NAME, localePath, type Lang } from "./i18n";

export type PageKey = "home" | "play" | "measure" | "districts" | "dataCollection";

export const PAGE_PATH: Record<PageKey, string> = {
  home: "/",
  play: "/play",
  measure: "/measure",
  districts: "/districts",
  dataCollection: "/data-collection",
};

type Copy = { title: string; description: string; og: { headline: string; tagline: string; alt: string } };

export const PAGE_COPY: Record<Lang, Record<PageKey, Copy>> = {
  en: {
    home: {
      title: "GrünRoute Heilbronn: find a cooler, safer way through Heilbronn",
      description:
        "Cooler, cleaner, and safer routes through Heilbronn, from real bike, tree, and heat data. No app, no sign up, no personal tracking.",
      og: {
        headline: "Find a cooler, safer way through Heilbronn",
        tagline: "Cooler, cleaner, and safer streets for Heilbronn.",
        alt: "GrünRoute Heilbronn: find a cooler, safer way through Heilbronn",
      },
    },
    play: {
      title: "Hot or not?",
      description: "Two real spots from the Heilbronn summer heat walks. Guess which one was warmer.",
      og: {
        headline: "Hot or not?",
        tagline: "Two real spots from the Heilbronn heat walks. Which one was warmer?",
        alt: "Hot or not? A heat guessing game from GrünRoute Heilbronn",
      },
    },
    measure: {
      title: "Help measure",
      description: "Short ride missions where Heilbronn has little bike sensor data. No sign up, nothing sent.",
      og: {
        headline: "Help measure Heilbronn",
        tagline: "Short ride missions where the city has little bike sensor data.",
        alt: "Help measure, ride missions from GrünRoute Heilbronn",
      },
    },
    districts: {
      title: "District league",
      description:
        "How well each part of Heilbronn is measured, and how green its streets are. Data about streets, not people.",
      og: {
        headline: "District league",
        tagline: "How well each part of Heilbronn is measured, and how green its streets are.",
        alt: "District league for Heilbronn from GrünRoute Heilbronn",
      },
    },
    dataCollection: {
      title: "How to collect data",
      description:
        "How to collect clean street data for Heilbronn: rules, quality checks, privacy, and a demo upload. Dev mode, demo only.",
      og: {
        headline: "How to collect street data",
        tagline: "Good data first. A street score is only as good as the rides behind it.",
        alt: "How to collect data, a guide from GrünRoute Heilbronn",
      },
    },
  },
  de: {
    home: {
      title: "GrünRoute Heilbronn: kühler und sicherer durch Heilbronn",
      description:
        "Kühlere, sauberere und sicherere Wege durch Heilbronn, aus echten Rad-, Baum- und Hitzedaten. Keine App, keine Anmeldung, kein persönliches Tracking.",
      og: {
        headline: "Kühler und sicherer durch Heilbronn",
        tagline: "Kühlere, sauberere und sicherere Straßen für Heilbronn.",
        alt: "GrünRoute Heilbronn: kühler und sicherer durch Heilbronn",
      },
    },
    play: {
      title: "Heiß oder nicht?",
      description: "Zwei echte Orte aus den Hitze-Rundgängen im Heilbronner Sommer. Rate, welcher wärmer war.",
      og: {
        headline: "Heiß oder nicht?",
        tagline: "Zwei echte Orte aus den Heilbronner Hitze-Rundgängen. Welcher war wärmer?",
        alt: "Heiß oder nicht? Ein Hitze-Ratespiel von GrünRoute Heilbronn",
      },
    },
    measure: {
      title: "Mitmessen",
      description: "Kurze Rad-Missionen, wo Heilbronn wenig Daten von Rad-Sensoren hat. Keine Anmeldung, nichts wird gesendet.",
      og: {
        headline: "Miss mit für Heilbronn",
        tagline: "Kurze Rad-Missionen, wo die Stadt wenig Daten von Rad-Sensoren hat.",
        alt: "Mitmessen, Rad-Missionen von GrünRoute Heilbronn",
      },
    },
    districts: {
      title: "Stadtteil-Liga",
      description:
        "Wie gut jeder Stadtteil von Heilbronn gemessen ist und wie grün seine Straßen sind. Daten über Straßen, nicht über Menschen.",
      og: {
        headline: "Stadtteil-Liga",
        tagline: "Wie gut jeder Stadtteil gemessen ist und wie grün seine Straßen sind.",
        alt: "Stadtteil-Liga für Heilbronn von GrünRoute Heilbronn",
      },
    },
    dataCollection: {
      title: "So sammelst du Daten",
      description:
        "So sammelst du saubere Straßendaten für Heilbronn: Regeln, Qualitätsprüfung, Datenschutz und ein Demo-Upload. Entwicklungsmodus, nur Demo.",
      og: {
        headline: "So sammelst du Straßendaten",
        tagline: "Gute Daten zuerst. Ein Straßen-Score ist nur so gut wie die Fahrten dahinter.",
        alt: "So sammelst du Daten, eine Anleitung von GrünRoute Heilbronn",
      },
    },
  },
};

/** Full metadata for one page in one language. */
export function pageMetadata(lang: Lang, page: PageKey): Metadata {
  const copy = PAGE_COPY[lang][page];
  const path = localePath(lang, PAGE_PATH[page]);
  const url = `${SITE}${path === "/" ? "" : path}`;
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = localePath(l, PAGE_PATH[page]);
  languages["x-default"] = PAGE_PATH[page];
  // The home title already names the site, the other pages get it added.
  const title = page === "home" ? { absolute: copy.title } : copy.title;
  const shareTitle = page === "home" ? copy.title : `${copy.title} | ${SITE_NAME}`;
  return {
    title,
    description: copy.description,
    alternates: { canonical: path, languages },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: shareTitle,
      description: copy.description,
      url,
      locale: OG_LOCALE[lang],
      alternateLocale: LANGS.filter((l) => l !== lang).map((l) => OG_LOCALE[l]),
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: copy.description,
    },
  };
}
