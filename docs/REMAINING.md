# What is left to do (hand-off, 28 Oct 2026)

The GrünRoute Planner (city staff app in `admin/`) is done, pages A1 to A7 of `../ADMIN_PROMPT.md`. Part 0 (shared fixes) is done too. This file lists what is still open, so someone else can pick it up.

Code freeze: Thu 29 Oct 2026, 14:00. Fair: 15:00.

## How to start

```bash
cd grunroute-heilbronn
git checkout main && git pull
git checkout -b people-app
npm install
npm run dev            # people app, http://localhost:3000
cd admin && npm install && npm run dev -- -p 3200   # Planner, http://localhost:3200
```

Read first: `../ADMIN_PROMPT.md` Part B (line 232 to the end), `CLAUDE.md`, `../Readme.md`, `app/page.tsx`, `lib/priority.ts`, `lib/segments.ts`, `lib/routing.ts`, `lib/missions.ts`.

Checks before every push: `npm run lint && npm test && npm run build` in the root and in `admin/`. Open a pull request into `main`. Vercel builds a preview for each push. Check the preview in a real browser before you merge.

## 1. Part B, the people app (repo root), not started

Full spec: `../ADMIN_PROMPT.md` Part B. Short list:

1. Remove the "For the city / For people" switch and the city-only parts from `app/page.tsx`. Delete code left unused.
2. Above the fold, in this order, map visible without scrolling at 390 px:
   1. slim header (logo and wordmark)
   2. headline "Find a cooler, safer way through Heilbronn"
   3. tagline "Cooler, cleaner, and safer streets for Heilbronn"
   4. proof chip "2,281 rides, 5,205 km, Dec 2025 to Oct 2026" plus "No app. No sign up. No personal tracking."
   5. the trip planner, then the map
3. Keep: OSRM trip planner and route comparison, map layers (trees, heat walk, close passes), drinking water, info cards, live sensor snapshot, Collect data page.
4. New read-only layer "Streets the city should look at": Balanced preset, street level (`aggregateStreets` in `lib/priority.ts`), bands only, no sliders. Caption: "From GrünRoute Planner. A screening list, not a decision."
5. `/play`, "Hot or not?": 5 rounds, two real heat walk spots at least 0.8 °C apart, "Which was warmer on the walk?", reveal both anomalies and trees within 40 m, end screen links to Help measure, score and "Heat detective" badge in localStorage only.
6. "Help measure" tab: reads `public/data/missions.json` (format v1, see the header of `lib/missions.ts`), missions by district with a route card, "Adopt" in localStorage, badges First mission, 3 time bands, School street helper. District progress is the share of streets with trusted data from `segments.json`, never from clicks. Rule text: "Ride only your normal, safe routes in daylight. Adults collect data for school streets. We never record who you are." Link to the Heilbronn Mängelmelder.
7. District league: per Stadtteil, measured share, tree crown cover along streets, species mix against 10-20-30. Caption "Data about streets, not people." Sort only, no medals. The Planner shade page (`admin/app/trees`) already computes the species mix, reuse that logic.
8. "This street matters to me" chips on a street card (heat, close passes, dust, school route), this browser only, labelled "demo, not sent anywhere". Never changes a score. Say that sending them to the Planner is roadmap.
9. Fair mode `?fair=1`: big type, auto tour every 12 s (hero line, cool route vs fastest, Hot or not, Help measure, Scan to try), QR code made at build time with `qrcode` (MIT), any tap stops the tour.
10. Header and footer link "For city staff: GrünRoute Planner" to the Planner URL.

### Extra request from the owner: live navigation like Google Maps

When someone uses the app to go from A to B, they should see their live location and hear sound and voice cues.

- Ask for location only after a tap on "Start", with `navigator.geolocation.watchPosition` (high accuracy). Show a moving dot with an accuracy circle on the chosen route, and keep the map following it (a "re-centre" button when the user pans away).
- Get turn steps from OSRM with `steps=true` (routing.openstreetmap.de, bike and foot profiles, same as now). Show the next turn and the distance to it.
- Voice: `speechSynthesis` for "In 100 m, turn left onto X", "You have arrived". Sounds: short Web Audio beeps (an `AudioContext` made inside the Start tap, iOS needs that). A mute button.
- Off route: if the dot is more than about 40 m from the route for a few readings, say "Off route" and offer to re-route from the current spot.
- Keep the screen on with the Wake Lock API where it exists. Stop everything on "End" and on page hide.
- Privacy, must hold: the location never leaves the browser. Only the start and end points go to OSRM, as today. No storage of the track. Never say the city tracks routes. Add one line on screen: "Your location stays on this phone."
- Test on a real phone over HTTPS (the Vercel preview), since geolocation needs a secure page. Desktop Chrome DevTools "Sensors" can fake a moving location.

## 2. Docs, not done

- `CLAUDE.md`: two apps, rules for each, both URLs, the new above the fold for the people app.
- `../Readme.md`: links, method, the two-app structure, open issues, and which deck slides must change to show two apps.
- `CHANGELOG-hackathon.md`: add Part 0, A1 to A7 (commits d173249 to d94d28f) and Part B.
- `docs/qa/2026-10-29-split.md`: the QA note for both apps.
- Security note for the README: Planner Basic Auth (`admin/proxy.ts`) is a demo gate, not real security. A real rollout needs the city's SSO.

## 3. Demo script, under 3 minutes (from ADMIN_PROMPT.md)

Planner: Overview, Heat maps compare ("hot and no trees"), a street dossier and its print, plant 8 trees and watch the rank drop, set a status to Ground check planned, build a mission from a school-street gap, approve uploaded data then roll back. People app on a phone: a cool route against the fastest, "Hot or not?", adopt the mission the Planner just made. The last step needs Part B.

## 4. Planner checks not done yet

- Print output of the dossier, the Top 10 report, the planting plan and the mission cards (only the screen view was checked).
- 390 px views of /data, /live, /trees (the Planner is desktop first and shows a note on small screens).
- GeoJSON upload in the new data approval demo (CSV upload was checked).
- `node scripts/build-hex.mjs` (H3 cells for the heat maps) is not in the rebuild list on the Data page.

## 5. Data not obtained, and why

- CARTO basemap key: not needed, OSM tiles are used.
- suncalc: not added, the sun position is computed in `lib/sun.ts`.
- ATRAI bin edges: not published, they were inferred from the data. Say so where bins show.
- WRI, TUM and felt temperature sources: not confirmed as open, not used.
- OSM buildings: from an Overpass mirror, data dated 1 Jun 2026. The shade estimate is a simple model, its scale is relative, not a measured value.
- DWD station 15547 Heilbronn/Neckar: Bright Sky has wind only, no temperature. The Live page uses 03734 Obersulm-Willsbach, about 10 km east, and says so.
- UBA air data API: no CORS header, a browser cannot call it. The Live page links to UBA instead (stations DEBW015 and DEBW152).
- openSenseMap: the exact city bbox with `full=true` sometimes returned a cut off answer. `lib/live.ts` now rounds the bbox and retries once.

## 6. Vercel, optional click steps for the owner

Planner Basic Auth is off until both env vars exist. To turn it on:

1. vercel.com, team mafzaalafzals-projects, project grunroute-planner.
2. Settings, Environment Variables.
3. Add `ADMIN_USER` and `ADMIN_PASSWORD`, choose your own values, tick Production and Preview, Save.
4. Deployments, the latest one, the three dots, Redeploy.

Never write the values in files or chat.
