# Directions: heading arrow and grey covered route (2026-10-28)

Branch `nav-progress`, PR #15. People app only. admin/ is not changed.

## What changed

- The blue dot now has an arrow that shows which way you are going, like Google Maps.
  - When the phone is moving (1 m/s or more) and gives a heading, the arrow uses the phone heading.
  - Else, when the dot is within 25 m of the route, the arrow follows the route at that point.
  - Else it keeps the last heading. With no heading at all, the arrow is hidden and only the dot shows.
- The part of the route you have already covered turns grey. The part still ahead stays green with chevrons. Chevrons on the grey part are removed.
  - The covered part only grows. It does not grow from a reading more than 40 m off the route, so a bad GPS fix cannot jump it forward.
  - After "Re-route from here" the new route starts fully green.
- Code: `lib/nav.ts` (bearing, headingFor, splitAt, with tests), `lib/useNavigation.ts` (heading and covered in the state), `components/MapView.tsx` (arrow and grey line), `components/Home.tsx`, `app/globals.css`.
- The heading is worked out on the phone. It is not stored and not sent anywhere. "Your location stays on this phone." still holds.

## What was checked in a real browser

Chrome on a Mac, with a simulated position in the test tab only (watchPosition was replaced in the tab, no simulation code ships). Trip: Hauptbahnhof to Bildungscampus, by bike.

| Check | Local dev, 390 px | Preview, 390 px | Preview, desktop |
| --- | --- | --- | --- |
| Grey part behind the dot, green with chevrons ahead | yes | yes | yes |
| Arrow follows the route when no phone heading | yes, 64 deg | yes, 64 deg | yes, 67 deg |
| Phone heading wins when moving (180 at 4.2 m/s) | yes | not repeated | not repeated |
| Far reading keeps the last heading, grey part does not grow | yes | not repeated | not repeated |
| Re-route resets the grey part | not run | not run | yes |
| End removes the dot and the directions | yes | yes | yes |
| No horizontal overflow | 390 | 390 | 1512 |
| No console errors | yes | yes | yes |

Preview: https://grunroute-heilbronn-git-nav-progress-mafzaalafzals-projects.vercel.app

Build, lint and test:

- Root: build, lint and test pass (50 tests, 3 new for bearing, heading and split).
- admin/: build, lint and test pass (19 tests).

## What was not checked

- A real phone with real GPS and a real compass heading. The arrow on a phone held still with no heading from the phone is only tested through the route fallback.
- Safari and iOS.
- Screen readers. The arrow is drawn in CSS and has no text of its own; the dot already had none.
- Light mode.

## Images

In `docs/qa/2026-10-28-nav-progress/`:

- `follow-390.png`: 390 px, follow mode, grey behind the dot and the arrow on it.
- `whole-390.png`: 390 px, the whole route, grey part and green part.
- `whole-desktop.jpg`: desktop, the whole route on the preview.
- `reroute-desktop.jpg`: desktop, after "Re-route from here", the new route is all green.

Notes on the shots: local shots show the round "N" button of the Next.js dev tools, which is not part of the app. On the preview, the Vercel toolbar button was hidden in the test tab.
