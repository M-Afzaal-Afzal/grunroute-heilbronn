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

1. **Data rule.** Use only the data the organisers and partners provided (ATRAI, openSenseMap, Heat Island Summer School, OpenStreetMap). Never invent street scores, ride counts, or any other number. Missing data is marked "little data" or "weak evidence", never filled in.
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
- `lib/data.ts`, street list, places, map centre

## Home page, above the fold

First screen, no scrolling, in this order: slim header (36 to 40px, wordmark and logo only, no banners), headline "Which street should Heilbronn fix first?", tagline "Cooler, cleaner, and safer streets for Heilbronn", proof chip "2,281 rides, 5,205 km, Dec 2025 to Oct 2026" plus "No app. No sign up. No personal tracking.", the For the city / For people switch, then the map. Tap targets at least 44px, body text at least 16px, no horizontal overflow at 390px wide.

## Current street list caveat

The ranked street table is an ATRAI sample ranked by overtaking distance only, not a full city ranking. Heat, dust, and roughness did not change these scores. Say that clearly wherever the list appears. Turmstrasse has no score and must not get one invented. The For people view now uses real routes from OSRM (routing.openstreetmap.de, bike and foot profiles) on OpenStreetMap, with a direct route plus detours, compared on mapped trees, heat walk spots, ATRAI close pass points, and fix first streets. The comfort rule is in `lib/routing.ts`, it is a simple documented rule, not an official rating, and must be described that way.

## Map data layers (added 27 Oct 2026)

- `lib/osm-trees.ts`: 1,903 OSM trees, 35 tree rows, 6 drinking water points, read from the OSM API 0.6 on 27 Oct 2026. Call them "mapped trees", never a tree census.
- `lib/heat-walks.ts`: Heat Island Summer School walks, 1 to 3 Sep 2026, 61,546 points as 325 spots. Values are anomalies against the median of the same walk, not raw temperatures.
- ATRAI danger_zones_heilbronn is read live in the browser (`lib/atrai.ts`) only when the Close passes layer is on or routes are compared.
- Trees, heat, and close passes are context only. They never change the fix score.
- Selects use the shadcn Select in `components/ui/select.tsx` (Radix). Use it for any new select.

## Workflow for any change

1. Read `../Readme.md` (full detail), `app/page.tsx`, `app/data-collection/page.tsx`, `lib/data.ts`, and `components/brand/Logo.tsx` before changing anything.
2. Check the live site, then the GitHub main branch, then build locally.
3. Make only the change asked for.
4. Run `npm run build` and fix all errors before pushing.
5. Push to main, then check the Vercel deployment that push triggers, and check the live URL, before saying it is done.
6. State plainly what was checked and what was not, especially if a browser click check did not happen.

## Open issues (as of 27 Oct 2026)

- Browser click checks for the redesigned home page (search, filter, street select and map fly, swap, 390px no overflow) passed in headless Chromium with stand-in map tiles. Still to check in a real browser: real CARTO map tiles, the live openSenseMap panel, and the Collect data upload and template download.
- Mentor confirmation of the "city first" idea is still pending at OpenSpace.
- Team registration status at hackathon.greencity.hn/teams is unconfirmed.
