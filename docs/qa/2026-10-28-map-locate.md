# QA: centre on my location (28 Oct 2026)

Branch `map-locate`, from `main` at 5424ace. Checked on the local dev server in Chrome (agent-browser), 390 x 844 phone view and 1440 x 900 desktop, English and German. The position was simulated in the test tab only (watchPosition and getCurrentPosition replaced in the tab, no simulation code ships). Not checked on a real phone or a real ride.

## What was wrong

1. **Live directions, no way back after a zoom.** The map stopped following only on a one finger drag. A pinch, double tap, scroll wheel, zoom buttons, or arrow keys did not count, so the Re-centre button never showed, and the next GPS reading snapped the map back to zoom 17. On a phone this meant you could not look around the map, and there was no button to come back.
2. **Route map, no "my location" button.** Before Start, there was no way to centre the map on where you are.
3. **Map notes were hidden on phones.** `.map-msg` (for example "Close pass points could not be loaded") had no position, so it sat below the map, behind the routes sheet.
4. **Footer links ran together**: "Hot or not?Help measureDistrict league", with no gap.

## What changed

- `components/MapView.tsx`: a pinch (2 fingers), double tap, scroll wheel (when the map has focus), zoom buttons, and arrow or plus/minus keys now stop following, the same as a drag. The Re-centre button then shows, and the map no longer jumps back on the next reading. New `here` prop: one reading from "Show my location" shows the blue dot and moves the map once, so the dot lands in the open part of the map.
- `components/Home.tsx`: new round "Show my location" button in the map controls (EN and DE). Location is asked only after this tap, one reading only, never sent anywhere. Notes for "Finding your location...", blocked, and not found. The error note goes away after 8 s. The dot is cleared when directions end.
- `app/globals.css`: `.map-msg` is now a small white card under the layer chips, clear of the round buttons on phones. `.footer-links` now has gaps and wraps.

## Checks

| Check | Result |
|---|---|
| Directions: drag, Re-centre shows, tap it, map follows again | pass (01) |
| Directions: 2 finger touch, Re-centre shows | pass |
| Directions: scroll zoom out, next reading keeps zoom, Re-centre shows | pass (02) |
| Route map: Show my location, dot shown in open area | pass (03) |
| Route map: location blocked, note shown and readable | pass (04) |
| Desktop, German: Meinen Standort zeigen | pass (05) |
| Footer links spaced | pass (06) |
| Other pages at 390 px: no horizontal overflow, no broken images (play, measure, districts, data-collection, 404) | pass |
| Hot or not round, language switch keeps the page | pass |
| Root: `npm run lint`, `npm test` (55 pass), `npm run build` | pass |
| `admin/`: lint, test (19 pass), build | pass |

## Notes

- The CLAUDE.md line "location is asked only after a tap on Start" now has a second trigger, the Show my location tap. Same rule in spirit: only after a tap, stays on the phone. The From/To sheet already had "Use my location".
- The dev server once served a stale stylesheet after a CSS edit; a restart fixed it. Not an app bug.
- Dev only: the unknown route page logs a Next.js "Could not validate" notice for the 404. Not seen in a production build.
