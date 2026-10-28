# CLAUDE.md, GrunRoute Heilbronn

This file is read automatically by Claude Code when working in this repo. It is a short version of the full project README for Claude, which lives one level up at `../Readme.md`. Read that file too if you need the full detail (data sources, formulas, deck structure, open issues). This file holds the rules you must not break.

## What this is

GrunRoute Heilbronn turns existing bike, school, and heat data into a ranked plan for the city, so it can fix the hottest, dustiest, and least safe streets first. The same evidence gives residents a simple web map for cooler, cleaner, and safer routes, with no app, sign up, or personal tracking. Built for the Heilbronn Green City Hackathon, 27 to 29 Oct 2026.

City comes first, residents second.

## Live links

- Live site: https://grunroute-heilbronn-ebon.vercel.app
- Collect data page: https://grunroute-heilbronn-ebon.vercel.app/data-collection
- GitHub repo, private, branch main: https://github.com/M-Afzaal-Afzal/grunroute-heilbronn
- Vercel project: grunroute-heilbronn, pushes to main auto deploy to production
- The old URL ending in `.vercel.app` without `-ebon` is dead, do not use it

## Stack

Next.js 16.4.3, React 19.3.0, Leaflet 1.9.4, Tailwind CSS 4, App Router, Barlow and Barlow Semi Condensed fonts via @fontsource, hand built shadcn style components in `components/ui/`. No environment variables or secrets are needed.

## Hard rules, do not break these

1. **Data rule.** Use only the data the organisers and partners provided (ATRAI, openSenseMap, Heat Island Summer School) plus the open sources the organiser resources page lists (hackathon.greencity.hn/resources): OpenData Heilbronn, GovData, MobiData BW, DWD, Bright Sky, and Overpass (OpenStreetMap). Every source is listed in `lib/sources.ts` with provider, link, licence, date, and use, and the app renders its source list from there. Never invent street scores, ride counts, or any other number. Missing data is marked "little data" or "weak evidence", never filled in.
2. **No legal claims.** Never say a street breaks a legal limit, or that low cost sensors meet legislative accuracy (EU Ambient Air Quality Directive). This is a screening tool only.
3. **No live data claims.** The home page live panel reads public openSenseMap boxes in the browser only. A single live point never changes a street score. If there is no live feed, say so.
4. **No tracking claim.** The city does not track which routes people take, and must never be described as doing so. Scores come from sensor data already collected, aggregated by street.
5. **No unconfirmed partnerships.** Do not claim signed agreements with LUBW, UrbanAirLab, or any fleet operator. None are confirmed.
6. **Brand is set.** The logo is Fix Point (the u of Grün as a route ending under a target point), applied in `components/brand/Logo.tsx`, `app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png`. The full kit and rules are in `brand/BRAND.md`. Follow its colours (ink #0F2A23, Grün #12A150, mint #8EE6A8, paper #F4F7F5, fix score colours for data only) and type (Barlow Semi Condensed and Barlow). Do not swap the logo without the user asking.
7. **No em dashes or en dashes**, anywhere, in any output (code comments, docs, chat, slides). Use a comma, period, or plain hyphen.
8. **Simple, easy English** in anything user facing.
9. **Do not send, submit, or post anything on the user's behalf** without his explicit go ahead for that specific item.
10. **No secrets in chat or files.** Never ask for passwords or tokens.

## Key files

- `app/page.tsx`, home page
- `app/layout.tsx`, layout and font
- `app/globals.css`, global styles
- `app/data-collection/page.tsx`, Collect data page
- `components/MapView.tsx`, Leaflet map
- `components/brand/Logo.tsx`, Fix Point logo and wordmark
- `brand/`, brand kit: logo files, icons, social kit, fonts, tokens, BRAND.md
- `components/ui/`, hand built shadcn style primitives
- `lib/data.ts`, fix score bands, places, map centre, and the old 6 street sample (still used by the Collect data page only)
- `lib/sources.ts`, every data source with provider, link, licence, date, and use
- `scripts/build-segments.mjs`, builds `public/data/segments.json` (the measured street network)
- `lib/priority.ts`, fix first scoring and presets, tested by `npm test`
- `lib/segments.ts`, loads segments, builds the info card, list text, and hero number
- `lib/navigate.ts`, turn by turn trip helpers (track, next turn, spoken text, alerts)

## Home page, above the fold

Map app layout, chosen by the user on 28 Oct 2026 (like opening Google Maps): the map fills the whole screen and the page does not scroll. On top of the map float a search box (logo, "Search GrünRoute Heilbronn" for streets and places, plan a trip button), layer chips (Trees, Heat walk, Close passes), and round buttons (layers and legend, reset view, my location, zoom on desktop). Phones get a bottom sheet you can drag (peek, half, full). Desktop gets a left side panel with a hide tab. The sheet or panel always starts with, in this order: headline "Which street should Heilbronn fix first?", tagline "Cooler, cleaner, and safer streets for Heilbronn", proof chip "2,281 rides, 5,205 km, Dec 2025 to Oct 2026" plus "No app. No sign up. No personal tracking.", the For the city / For people switch. Below that: the fix first list or trip planner, then the sensor snapshot, how it works, data facts, more info, and footer. "My location" stays in the browser and is only sent to the router when used as a trip start. Tap targets at least 44px, body text at least 16px, no horizontal overflow at 390px wide.

## Fix first ranking (Phase 0, 28 Oct 2026)

The For the city view ranks the full measured street network: 11,319 ATRAI road segments, joined by road segment id, scored on 7 measures (close passes, hot spots, little shade, danger and dust, rough surface, stop and go, crashes). Users weight them with presets or sliders. Score is the weighted mean of per measure percentiles, method in `lib/priority.ts` and `../Readme.md`. A segment needs at least 2 weighted measures and one sensor measure, otherwise it is "little data", grey on the map, never hidden or filled in. Every count shown comes from `public/data/segments.json` meta, never typed in. Use this exact sentence wherever 150 cm appears: "150 cm is the minimum passing gap for cars in towns in Germany. Sensor readings are estimates and do not prove a single overtake broke the rule." Unnamed segments show "Unnamed segment near X", a location hint only.

The For people view uses real routes from OSRM (routing.openstreetmap.de, bike and foot profiles) on OpenStreetMap, with a direct route plus detours, compared on mapped trees, heat walk spots, ATRAI close pass points, and the current top 20 fix first segments. The comfort rule is in `lib/routing.ts`, it is a simple documented rule, not an official rating, and must be described that way. The Start ride / Start walk button runs a turn by turn trip in the browser (`lib/navigate.ts`, OSRM steps): live position, spoken turns, close pass and fix first street alerts from existing data, off route warning, and a preview mode when you are not near the route. The position stays on the device, only a new start point goes to OSRM when the user asks for a new route.

## Map data layers (added 27 Oct 2026)

- Trees come from the official city tree register: Stadt Heilbronn Baumkataster, Stand 01.01.2026, licence dl-de/by-2-0 (attribution "Stadt Heilbronn"). The source zip is in `data/source/`, `node scripts/build-trees.mjs` rebuilds `public/data/baumkataster.json` (43,031 trees), loaded on demand by `lib/cityTrees.ts`. Public trees only. Baumgruppe rows are groups with summed trunk girth, and non city trees often have a default 2 m crown, say so where it matters.
- `lib/osm-trees.ts`: OSM drinking water (6 points), and 1,903 OSM trees used only as a fallback if the register fails to load.
- "Shade gaps to check" lists warm heat walk spots (at least +1.0 degrees against the same walk) with the fewest register trees within 40 m. It is a screening list for ground checks, not a planting plan.
- `lib/heat-walks.ts`: Heat Island Summer School walks, 1 to 3 Sep 2026, 61,546 points as 325 spots. Values are anomalies against the median of the same walk, not raw temperatures.
- ATRAI danger_zones_heilbronn is read live in the browser (`lib/atrai.ts`) only when the Close passes layer is on or routes are compared.
- The map layers (trees, heat walk spots, close pass points) are context. The fix score uses the per segment measures in `segments.json`, which include crown cover and heat walk values.
- Selects use the shadcn Select in `components/ui/select.tsx` (Radix). Use it for any new select.

## Workflow for any change

1. Read `../Readme.md` (full detail), `app/page.tsx`, `app/data-collection/page.tsx`, `lib/data.ts`, and `components/brand/Logo.tsx` before changing anything.
2. Check the live site, then the GitHub main branch, then build locally.
3. Make only the change asked for.
4. Run `npm run build` and fix all errors before pushing.
5. Push to main, then check the Vercel deployment that push triggers, and check the live URL, before saying it is done.
6. State plainly what was checked and what was not, especially if a browser click check did not happen.

## Open issues (as of 28 Oct 2026)

- Phase 0 checks are in `docs/qa/2026-10-28-phase0.md`. The 390 px check used a 390 px wide iframe in desktop Chrome, not a phone.
- The Collect data page still uses the old 6 street sample from `lib/data.ts`.
- Licences: openSenseMap terms not confirmed, ATRAI collections and heat walks have no licence stated.
- Unfallatlas zips and the ATRAI PM file are gitignored for size, rebuilding needs them downloaded again.
- Mentor confirmation of the "city first" idea is still pending at OpenSpace.
- Team registration status at hackathon.greencity.hn/teams is unconfirmed.
