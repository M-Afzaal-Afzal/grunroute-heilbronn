# CLAUDE.md, GrunRoute Heilbronn

This file is read automatically by Claude Code when working in this repo. It is a short version of the full project README for Claude, which lives one level up at `../Readme.md`. Read that file too if you need the full detail (data sources, formulas, deck structure, open issues). This file holds the rules you must not break.

## What this is

GrunRoute Heilbronn turns existing bike, school, and heat data into a ranked plan for the city, so it can fix the hottest, dustiest, and least safe streets first. The same evidence gives residents a simple web map for cooler, cleaner, and safer routes, with no app, sign up, or personal tracking. Built for the Heilbronn Green City Hackathon, 27 to 29 Oct 2026.

City comes first, residents second.

## Two apps, one repo (since 29 Oct 2026)

| App | Folder | Who it is for | Production URL | Vercel project |
|---|---|---|---|---|
| GrünRoute (people app) | repo root | residents | https://grunroute-heilbronn-ebon.vercel.app | grunroute-heilbronn |
| GrünRoute Planner | `admin/` | city staff | https://grunroute-planner.vercel.app | grunroute-planner (root directory `admin`) |

- Collect data page: https://grunroute-heilbronn-ebon.vercel.app/data-collection
- GitHub repo, private, branch main: https://github.com/M-Afzaal-Afzal/grunroute-heilbronn
- Pushes to main auto deploy both projects to production. Other branches get preview URLs behind Vercel login.
- The old URL ending in `.vercel.app` without `-ebon` is dead, do not use it.
- The people app has **no link to the Planner**, by the owner's choice (this overrides ADMIN_PROMPT.md item B7). The Planner links back to the people app (`admin/lib/nav.ts`, `PEOPLE_APP`).
- Shared logic lives in the root `lib/`. `admin/scripts/sync-shared.mjs` copies it into `admin/lib/shared/` on predev, prebuild, and pretest. Edit the root copy, never the synced copy.

## Stack

Next.js 16.4.3, React 19.3.0, Leaflet 1.9.4, Tailwind CSS 4, App Router, Barlow and Barlow Semi Condensed fonts via @fontsource, hand built shadcn style components in `components/ui/`. The people app needs no environment variables or secrets. The Planner reads two optional env vars, see the Planner rules.

## Hard rules, both apps, do not break these

1. **Data rule.** Use only the data the organisers and partners provided (ATRAI, openSenseMap, Heat Island Summer School) plus the open sources the organiser resources page lists (hackathon.greencity.hn/resources): OpenData Heilbronn, GovData, MobiData BW, DWD, Bright Sky, and OpenStreetMap services (Overpass, OSRM routing, Nominatim place search). Every source is listed in `lib/sources.ts` with provider, link, licence, date, and use, and the app renders its source list from there. Never invent street scores, ride counts, or any other number. Missing data is marked "little data" or "weak evidence", never filled in.
2. **No legal claims.** Never say a street breaks a legal limit, or that low cost sensors meet legislative accuracy (EU Ambient Air Quality Directive). This is a screening tool only.
3. **No live data claims.** Live panels read public openSenseMap boxes in the browser only. A single live point never changes a street score. If there is no live feed, say so.
4. **No tracking claim.** The city does not track which routes people take, and must never be described as doing so. Scores come from sensor data already collected, aggregated by street.
5. **No unconfirmed partnerships.** Do not claim signed agreements with LUBW, UrbanAirLab, or any fleet operator. None are confirmed.
6. **Brand is set.** The logo is Fix Point (the u of Grün as a route ending under a target point), applied in `components/brand/Logo.tsx`, `app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png`. The full kit and rules are in `brand/BRAND.md`. Follow its colours (ink #0F2A23, Grün #12A150, mint #8EE6A8, paper #F4F7F5, fix score colours for data only) and type (Barlow Semi Condensed and Barlow). Do not swap the logo without the user asking.
7. **No em dashes or en dashes**, anywhere, in any output (code comments, docs, chat, slides). Use a comma, period, or plain hyphen.
8. **Simple, easy English** in anything user facing.
9. **Do not send, submit, or post anything on the user's behalf** without his explicit go ahead for that specific item.
10. **No secrets in chat or files.** Never ask for passwords or tokens.

## People app rules (root)

- No For the city / For people switch, no fix first list, sliders, or presets UI. Those live in the Planner.
- The people app shows no city ranking at all: no street layer, no street card, no "This street matters to me" chips (all removed on 28 Oct 2026, branch `ux-pass`). The ranking lives in the Planner only.
- Help measure progress comes from `segments.json` (share of streets with trusted data), never from clicks. Badges and game scores live in localStorage only.
- Live directions: location is asked only after a tap on Start. It never leaves the browser, except as the start and end points sent to OSRM. No track is stored. Show "Your location stays on this phone."
- Place search (Nominatim) runs only when the user submits a search, never on each key press.
- Start and end: a tap on the From or To row opens a search sheet (native `<dialog>`, full screen on phones, centred on wide screens) with search, Use my location, Choose on the map, and known places. Closing it returns focus to the row. No recent places are stored.

## Planner rules (`admin/`)

- Basic Auth in `admin/proxy.ts` is on only when `ADMIN_USER` and `ADMIN_PASSWORD` are set in Vercel. It is a demo gate, not real security. A real rollout needs the city's SSO. Never write the values in files or chat.
- The Planner owns the fix first ranking, presets and sliders, heat maps, shade and trees, data and missions (writes `public/data/missions.json` format v1, read by the people app), and the Live page.
- Do not open the Planner in the browser automation when auth is on, a Basic Auth dialog blocks the session.

## Home page, map first (people app, since 28 Oct 2026)

No scrolling to choose a route and start. Header (60 px tall on phones and 68 px on wide screens, 36 px logo and wordmark, page tabs on wide screens only, no banners). On phones (under 1024 px) the map fills the screen between the header and the 64 px tab bar, and the page does not scroll. A From and To card floats on top of the map, with a swap button and Bike and Walk as two 44 px icon toggles. Routes sit in a bottom sheet (not modal): at peek the routes side by side (time, km, one line on why), Start directions, and one line with the proof "2,281 rides, 5,205 km, Dec 2025 to Oct 2026" plus "No app. No sign up. No personal tracking."; a tap or drag on the handle opens the full sheet (details, How routes are chosen, About, live, facts, sources). The headline "Find a cooler, safer way through Heilbronn" and tagline "Cooler, cleaner, and safer streets for Heilbronn" sit in a first visit card with the proof, closed for good once dismissed (localStorage), reopened by the round About button. Desktop: the same parts in a left side panel, the map fills the rest. Map icons along the route come only from our data (`lib/routeIcons.ts`), at close zoom only. Tap targets at least 44px, body text at least 16px (only the map attribution is smaller), no horizontal overflow at 390px wide.

People app pages: `/` (trip planner, map, live directions), `/play` (Hot or not?), `/measure` (Help measure), `/districts` (District league), `/data-collection`. Fair mode is `/?fair=1`.

## Key files

People app:
- `app/page.tsx`, home page (server part, builds the fair mode QR code with `qrcode`)
- `components/Home.tsx`, trip planner, map layers, info cards, live directions
- `components/MapView.tsx`, Leaflet map
- `components/PlacePicker.tsx` and `lib/geocode.ts`, start and end search (Nominatim)
- `lib/useNavigation.ts`, `lib/nav.ts`, `components/NavPanel.tsx`, live directions (watchPosition, OSRM steps, speech, Web Audio beeps, off route, wake lock)
- `components/Play.tsx`, `lib/play.ts`, Hot or not?
- `components/Measure.tsx`, `lib/missions.ts`, `lib/badges.ts`, Help measure
- `components/Districts.tsx`, `lib/districts.ts`, `lib/species.ts`, District league
- `components/FairTour.tsx`, fair mode tour
- `app/data-collection/page.tsx`, Collect data page
- `components/brand/Logo.tsx`, Fix Point logo and wordmark

Shared (root `lib/`, synced into the Planner):
- `lib/priority.ts`, fix first scoring, presets, `aggregateStreets`, tested by `npm test`
- `lib/segments.ts`, loads segments, info card, list text, hero number
- `lib/sources.ts`, every data source
- `lib/data.ts`, fix score bands, places, map centre, and the old 6 street sample (Collect data page only)
- `scripts/build-segments.mjs`, builds `public/data/segments.json`

Planner: `admin/app/` (Overview, `priorities`, `maps`, `trees`, `data`, `live`, `street/[id]`, `print/top10`), `admin/lib/`, `admin/proxy.ts`.

## Fix first ranking

The ranking covers the full measured street network: 11,319 ATRAI road segments, joined by road segment id, grouped into 1,086 streets by name, or by location hint when unnamed (812 of them have enough data and are at least 20 m long), scored on 7 measures (close passes, hot spots, little shade, danger and dust, rough surface, stop and go, crashes). Score is the weighted mean of per measure percentiles, method in `lib/priority.ts` and `../Readme.md`. A street needs at least 2 weighted measures and one sensor measure, otherwise it is "little data", grey on the map, never hidden or filled in. Every count shown comes from `public/data/segments.json` meta, never typed in. Use this exact sentence wherever 150 cm appears: "150 cm is the minimum passing gap for cars in towns in Germany. Sensor readings are estimates and do not prove a single overtake broke the rule." Unnamed segments show "Unnamed segment near X" or "Unnamed street near X", a location hint only.

The people app trip planner uses real routes from OSRM (routing.openstreetmap.de, bike and foot profiles) on OpenStreetMap, with a direct route plus detours, compared on shade (register trees and big crowns), heat walk spots, and ATRAI close pass points only. The comfort rule is in `lib/comfort.ts` (tested in `tests/routing.test.mjs`), it is a simple documented rule, not an official rating, and must be described that way.

## Map data layers

- Trees come from the official city tree register: Stadt Heilbronn Baumkataster, Stand 01.01.2026, licence dl-de/by-2-0 (attribution "Stadt Heilbronn"). The source zip is in `data/source/`, `node scripts/build-trees.mjs` rebuilds `public/data/baumkataster.json` (43,031 trees), loaded on demand by `lib/cityTrees.ts`. Public trees only. Baumgruppe rows are groups with summed trunk girth, and non city trees often have a default 2 m crown, say so where it matters.
- `lib/osm-trees.ts`: OSM drinking water (6 points), and 1,903 OSM trees used only as a fallback if the register fails to load.
- `lib/heat-walks.ts`: Heat Island Summer School walks, 1 to 3 Sep 2026, 61,546 points as 325 spots. Values are anomalies against the median of the same walk, not raw temperatures.
- ATRAI danger_zones_heilbronn is read live in the browser (`lib/atrai.ts`) only when the Close passes layer is on or routes are compared.
- The map layers (trees, heat walk spots, close pass points) are context. The fix score uses the per segment measures in `segments.json`, which include crown cover and heat walk values.
- Selects use the shadcn Select in `components/ui/select.tsx` (Radix). Use it for any new select.

## Workflow for any change

1. Read `../Readme.md` (full detail) and the files you will change before changing anything.
2. Check the live site, then the GitHub main branch, then build locally.
3. Make only the change asked for.
4. Run `npm run build`, `npm run lint`, and `npm test` in the root and in `admin/`, and fix all errors before pushing.
5. Push to main, then check both Vercel deployments that push triggers, and check the live URLs, before saying it is done.
6. State plainly what was checked and what was not, especially if a browser click check did not happen.

## Open issues (as of 29 Oct 2026)

- Split checks are in `docs/qa/2026-10-29-split.md`. Browser checks used desktop Chrome and a 390 px wide iframe, not a phone. Live directions were checked with a simulated position, not on a real ride.
- Planner Basic Auth is off until the owner sets `ADMIN_USER` and `ADMIN_PASSWORD` in Vercel (see `docs/REMAINING.md` section 6).
- Some captions and chips in the people app are below 16 px.
- The Collect data page still uses the old 6 street sample from `lib/data.ts`.
- Licences: openSenseMap terms not confirmed, ATRAI collections and heat walks have no licence stated.
- Unfallatlas zips and the ATRAI PM file are gitignored for size, rebuilding needs them downloaded again.
- Mentor confirmation of the "city first" idea is still pending at OpenSpace.
- Team registration status at hackathon.greencity.hn/teams is unconfirmed.
