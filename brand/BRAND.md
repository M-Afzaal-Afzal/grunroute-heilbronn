# GrünRoute

Street evidence for Heilbronn. GrünRoute turns bike, school, and heat data into a ranked fix first list for the city, and a simple route map for people. The brand has one job: make a data tool feel calm, local, and trustworthy, so a city planner and a parent both take it seriously.

**Name:** GrünRoute, with the umlaut. Use "GrunRoute" only where a system cannot take ü (URLs, file names, repo names). The place line is **Heilbronn**, set smaller, never fused into the name.

**One line:** Which street should Heilbronn fix first?
**Tagline:** Cooler, cleaner, and safer streets for Heilbronn
**Promise:** No app. No sign up. No personal tracking.

## The logo: Fix Point

The mark is the **u** of Grün drawn as a street. The route runs down, bends, comes back up, and stops under a **target point**: the street to fix first. It reads three ways at once: the letter ü, a route from A to B, and a marked spot on a map.

- Built on a 120 unit grid. Tile radius 28. Route stroke 18 with round caps. Bend radius 24. Target 12 with a 4.5 centre.
- Primary: **Ink tile** (`ink` tile, `gruen` route, `mint` target). Use it for the app icon, favicon, profile pictures, and the header.
- On green: **Green tile** (`gruen` tile, white route, `ink` target). Use it on dark backgrounds and in lockups on ink.
- On paper: the paper tile, or the mono mark with no tile.
- Mono: one colour, no tile, the target drawn as a ring. For stamps, single colour print, and small icon rows.

**Clear space:** half the tile width on every side. **Smallest size:** 16px for the tiled mark, 24px for the lockup height.

**Do not:** redraw the route with sharp corners, add a second dot (it turns into a face), rotate it, put the mark on a photo without the tile, change the target colour to red or amber (those are data colours), or add a leaf, pin, or gradient.

Why this mark won over four others (see `concepts/logo-exploration.png`): a symmetric ü with two dots read as a smiling face; a numbered map pin looks like every map app; a route G looks like many G logos; three ranked bars read as a menu icon. Fix Point is the only one that is about this product: one route, one marked street.

### Lockups

| Lockup | When |
| --- | --- |
| Horizontal with Heilbronn | Default. Website header, decks, documents. |
| Short (GrünRoute only) | Where Heilbronn is already clear: social posts, app header on small screens. |
| Stacked | Square spaces: posters, title slides, stickers. |
| Wordmark only | Only when the mark is already on the same surface. |

Gap between mark and wordmark: 22% of the mark height. The wordmark cap height sits inside the middle of the tile.

## Colour

Two brand colours and one accent, on a cool paper ground. Data colours are separate and never decorate.

- **Neckar ink** `ink` is the brand's dark. Banners and posts are mostly ink.
- **Grün** `gruen` is the route. Graphics and big type only. For green text on light ground use `gruen-text`.
- **Mint** `mint` is the target point and the accent on ink.
- **Paper** `paper` is the page. It is a cool green white, never cream.
- **Fix score colours** `fix-soon`, `plan-next`, `check-later` are for data only: map lines, rank pins, score bars. They always sit next to a label, so colour is never the only signal.
- **Heat** `heat` is reserved for heat warnings.

Contrast: `text` on `paper` 15.3:1, `moss` on `paper` 6.0:1, `gruen-text` on `paper` 5.0:1, `mint` on `ink` 10.2:1, white on `gruen` 3.4:1 (large type and graphics only), white on `plan-next` 4.0:1.

## Type

One family in two widths, from road signage. **Barlow Semi Condensed** (700, 800) for headlines, street names, and numbers. It is narrow and upright like a street sign, so long German street names fit. **Barlow** (400 to 700) for everything you read. Both are open source (SIL OFL).

- Headlines in sentence case, tight leading (1.0 to 1.1), slight negative tracking.
- Numbers use tabular figures so scores line up.
- Body text never under 16px on screens.
- No all caps labels, no italics for emphasis.

## The route graphic

On banners and posts the logo's route becomes a large supergraphic: a thick `gruen` line that enters from the left edge, bends up, and stops under a `mint` target point. It always ends at a target, and there is only one per layout. The headline sits on clean ink above the line, never on top of it.

## Voice

Plain, simple English. Short sentences. Say what the data shows and what it does not.

- Name the source: "ATRAI sample, not a full city ranking."
- Say when data is thin: "Weak evidence, ground check first."
- Never say a street breaks a legal limit, never say live data when it is not, never promise tracking or partnerships.
- No em dashes or en dashes. Use a comma, a period, or a plain hyphen.
- Numbers come from the organisers' data only: 2,281 rides, 5,205 km, 304 hours, 32 riders, 5 Dec 2025 to 26 Oct 2026.

Good: "Cars pass close, average 77 cm in the ATRAI sample."
Not this: "Salzstraße is dangerous and illegal."

## Layout rules for the product

- Header 40px, logo and wordmark only.
- Above the fold, in order: headline, tagline, proof line, the For the city / For people switch, the map.
- Lists are rows split by `stone` hairlines, with one badge per row. The active row gets a `surface` fill and a bar in its score colour.
- Tap targets at least 44px. No horizontal scroll at 390px.

## Social kit

All files are in `social/`, built from the same tokens.

| File | Size | Use |
| --- | --- | --- |
| profile-ink.png | 1080 × 1080 | Profile picture everywhere (circle safe) |
| profile-green.png | 1080 × 1080 | Alternate profile picture |
| x-header.png | 1500 × 500 | X header |
| linkedin-cover.png | 1584 × 396 | LinkedIn personal cover |
| linkedin-company-cover.png | 1128 × 191 | LinkedIn page cover |
| facebook-cover.png | 1640 × 624 | Facebook cover |
| youtube-banner.png | 2560 × 1440 | YouTube banner, text inside the 1546 × 423 safe area |
| og-image.png | 1200 × 630 | Link previews and LinkedIn posts |
| post-01-question.png | 1080 × 1350 | Launch post |
| post-02-data.png | 1080 × 1350 | The data behind the list |
| post-03-street.png | 1080 × 1350 | Street spotlight template (Salzstraße) |
| post-04-promise.png | 1080 × 1350 | No app, no sign up, no tracking |
| story-01.png | 1080 × 1920 | Story |
| title-card-16x9.png | 1920 × 1080 | Pitch title slide, video intro |

Post rules: 84px margins at 1080px wide, the short lockup top left, one idea per post, the data source in small type at the bottom. Nothing has been posted yet.

## Files in this folder

| Folder | What |
| --- | --- |
| `logo/svg/` | Mark, lockups and wordmark as SVG, text outlined |
| `logo/png/` | The same at high resolution with transparent backgrounds |
| `icons/` | favicon.ico, icon.svg, 16 to 512px PNGs, apple-touch-icon, maskable icon |
| `social/` | The social kit listed above |
| `fonts/` | Barlow and Barlow Semi Condensed woff2 files (SIL OFL), for design tools |
| `concepts/` | The logo exploration board |
| `tokens.json` | Colour, type, spacing and radius tokens |

The live design system with previews is the GrünRoute Brand artifact on claude.ai.
