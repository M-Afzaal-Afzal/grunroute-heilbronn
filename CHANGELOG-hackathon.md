# Changelog, Green City Hackathon

## Phase 0, 28 Oct 2026, branch `upgrade`

- Data rule now allows the organiser listed open sources. Every source is in `lib/sources.ts` and the page renders its source list from there.
- `scripts/build-segments.mjs` builds `public/data/segments.json`: 11,319 ATRAI road segments with 7 measures, joined by road segment id. Crashes from Unfallatlas 2021 to 2025, schools and kindergartens from OSM, crown cover from the city tree register, heat walk anomalies.
- `lib/priority.ts`: percentile scoring, 6 presets, minimum data rule, data support labels, proposed coverage gate. 7 unit tests (`npm test`).
- For the city view: priorities panel with presets and sliders, full network map coloured by fix score band, a "Why this street" bar in the info card, top 20 list with search and district filter, hero number computed at runtime, URL state with Copy link, mobile legend button.
- Unnamed segments show the nearest named street within 60 m as a location hint.
- Live panel uses one sensor box and exact PM2.5 and PM10 titles.
- Method, facts, and source text updated to the full measured network. The 6 street sample and the Turmstrasse note are gone from the home page.
- Not changed: the Collect data page still uses the old sample.
- Loading: street data and trees wait for the first map tiles, city lines are drawn in chunks, worst score on top. Lighthouse mobile performance 64 to 76, below the 80 target, see `docs/qa/2026-10-28-phase0.md`.

## Part 0, 29 Oct 2026, commit d173249

- `lib/priority.ts`: `aggregateStreets` groups segments into streets (name, or location hint, plus district), with length weighted means, summed coverage, and each crash counted once per street. Rows shorter than 20 m are not ranked. `enoughData` and `districtLabel` added.
- The ranking now has 1,086 streets, 812 of them with enough data and at least 20 m long.
- Hero line: the share of detected passes under 150 cm, with the detection caveat.
- `lib/live.ts`: openSenseMap boxes inside the city boundary only, values below 0 dropped.
- `lib/tiles.ts`: OSM tiles stay, since CARTO Voyager now needs an API key.

## GrünRoute Planner, A1 to A7, 29 Oct 2026, commits 93a9e73 to d94d28f

New app in `admin/`, Vercel project grunroute-planner, https://grunroute-planner.vercel.app.

- A1 (93a9e73): app shell, optional Basic Auth in `admin/proxy.ts` (on only when `ADMIN_USER` and `ADMIN_PASSWORD` are set, a demo gate, not real security), shared `lib/` sync, Overview page.
- A2 (3d8500e): Fix first page with street and segment levels, filters, scenarios, compare, export, URL state.
- A3 (6f6520d): heat maps on H3 cells (r8, r9, r10) with compare, overlays, cell details, GeoJSON and PNG export. `scripts/build-hex.mjs`.
- A4 (1ead1de): street dossier with map, measures, charts, case workflow, DE and EN print, Top 10 report.
- A5 (3b09831): shade simulator from OSM building heights and register crowns, tree what-if, planting plan, species mix. Little shade uses the estimated 15:00 shade share on 21 July where it exists (5,389 Kernstadt segments).
- A6 (b804f08): coverage by data support, gap finder, mission builder writing `public/data/missions.json` (format v1, 6 missions, 24 streets), new data approval demo (localStorage only), sources and freshness.
- A7 (d94d28f): Live page with DWD temperature via Bright Sky, hot day flag, openSenseMap boxes in the city, UBA station links.

## Part B, people app, 29 Oct 2026, branch `people-app`, commits 84f154b to 75bb249

- The For the city / For people switch and the city only parts (fix first list, sliders, presets, shade gaps list, rank pins) are gone from the people app. Unused code deleted.
- New above the fold: slim header, "Find a cooler, safer way through Heilbronn", tagline, proof chip, trip planner, map. The map shows at 390 px.
- Trip planner: any start and end, by search (Nominatim, on submit only), by map tap, or the current location. Real OSRM routes compared on shade, heat walk spots, and close passes.
- Live directions: location asked only after Start, dot with accuracy circle, map follows with a re-centre button, next turn and distance from OSRM steps, voice (speechSynthesis), beeps (Web Audio), mute, off route warning with re-route, Wake Lock, all stopped on End and page hide. "Your location stays on this phone." No track stored.
- Read only layer "Streets the city should look at" (Balanced, street level, bands only), with the caption "From GrünRoute Planner. A screening list, not a decision."
- "This street matters to me" chips on street cards: this browser only, "demo, not sent anywhere", never change a score.
- `/play` Hot or not?: 5 rounds of real heat walk spots, reveal with anomalies and trees within 40 m, Heat detective badge in localStorage.
- `/measure` Help measure: missions from `missions.json` by district, Adopt and badges in localStorage, district progress from `segments.json`, safety rule, Mängelmelder link.
- `/districts` District league: measured and trusted share, crown cover estimate, species mix against 10-20-30, sorting only, little data flag under 10 streets.
- Fair mode `/?fair=1`: large type, auto tour every 12 s, QR code made at build time with `qrcode` (MIT), any tap stops it.
- No link from the people app to the Planner, by the owner's choice (overrides ADMIN_PROMPT.md item B7).
- Fixes after the preview check (5af234e, 75bb249): the first turn is no longer spoken twice, "Arrived" on arrival, the turn banner stays in view on desktop, zoom buttons clear of the End button, small districts flagged, one search row per street.

## UX pass, people app, 28 Oct 2026, branch `ux-pass`

- Removed from the people app: the "Streets the city should look at" layer (chip, map lines, caption, legend), the street card it opened, and the "This street matters to me" chips (`StreetChips.tsx`, `gr.matters.v1`). The city ranking now lives in the Planner only.
- Route comparison no longer counts the top 20 city streets. GrünRoute is picked on shade, heat walk spots, and close pass points only. The rule moved to `lib/comfort.ts`, with tests in `tests/routing.test.mjs`.
- The Planner uses none of the removed code. Shared `lib/` files the Planner reads (`insights.ts`, `segments.ts`, `priority.ts`) are unchanged apart from the people app only "segment" selection.
