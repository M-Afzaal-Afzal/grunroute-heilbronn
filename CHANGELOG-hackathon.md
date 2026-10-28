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
