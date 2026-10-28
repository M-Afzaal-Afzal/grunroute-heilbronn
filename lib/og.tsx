// Share image for Open Graph and X (Twitter), 1200 x 630, one per page and
// language. Same look as the brand kit card: ink ground, Fix Point mark,
// Barlow Semi Condensed headline, a green route ending under a mint target.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { isLang, type Lang } from "./i18n";
import { PAGE_COPY, type PageKey } from "./seo";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

const fontFile = (pkg: string, file: string) => readFile(join(process.cwd(), "node_modules/@fontsource", pkg, "files", file));

// Cached, so the images can be made once at build time.
async function loadFonts() {
  "use cache";
  const [display, body] = await Promise.all([
    fontFile("barlow-semi-condensed", "barlow-semi-condensed-latin-800-normal.woff"),
    fontFile("barlow", "barlow-latin-500-normal.woff"),
  ]);
  return { display: new Uint8Array(display), body: new Uint8Array(body) };
}

export function ogAlt(lang: string, page: PageKey) {
  return PAGE_COPY[isLang(lang) ? lang : "en"][page].og.alt;
}

export async function ogImage(langParam: string, page: PageKey) {
  const lang: Lang = isLang(langParam) ? langParam : "en";
  const { headline, tagline } = PAGE_COPY[lang][page].og;
  const { display, body } = await loadFonts();
  const big = headline.length > 34 ? 80 : 100;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#0F2A23", fontFamily: "Barlow" }}>
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", left: 0, top: 0 }}>
          <path d="M0 588 H920 A120 120 0 0 0 1040 468 V330" fill="none" stroke="#12A150" strokeWidth="44" strokeLinecap="round" />
          <circle cx="1040" cy="236" r="44" fill="#8EE6A8" />
          <circle cx="1040" cy="236" r="16" fill="#0F2A23" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", padding: "56px 72px", width: 940 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <svg width="76" height="76" viewBox="0 0 120 120">
              <rect width="120" height="120" rx="28" fill="#12A150" />
              <g transform="translate(-1.5 2.5)">
                <path d="M36 34 V64 A24 24 0 0 0 84 64 V56" fill="none" stroke="#FFFFFF" strokeWidth="18" strokeLinecap="round" />
                <circle cx="84" cy="30" r="12" fill="#0F2A23" />
                <circle cx="84" cy="30" r="4.5" fill="#12A150" />
              </g>
            </svg>
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 18 }}>
              <span style={{ fontFamily: "Barlow Semi Condensed", fontSize: 38, color: "#FFFFFF", lineHeight: 1 }}>GrünRoute</span>
              <span style={{ fontSize: 24, color: "#8EE6A8", marginTop: 4 }}>Heilbronn</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 44,
              fontFamily: "Barlow Semi Condensed",
              fontSize: big,
              lineHeight: 1.02,
              color: "#FFFFFF",
              letterSpacing: "-0.01em",
            }}
          >
            {headline}
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 30, color: "#8EE6A8", lineHeight: 1.3, maxWidth: 860 }}>{tagline}</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Barlow Semi Condensed", data: display.slice().buffer, weight: 800, style: "normal" },
        { name: "Barlow", data: body.slice().buffer, weight: 500, style: "normal" },
      ],
    },
  );
}
