# QA: "Your location could not be found" on a laptop (28 Oct 2026)

Branch `location-help`.

## What happened

On the owner's Mac, in Chrome, on the live site:

- Site permission for location: granted. Secure page: yes.
- Both high and low accuracy requests failed within 8 ms with code 2, "Position update is unavailable".
- macOS Location Services is on for the whole Mac.
- No Permissions-Policy header blocks location.

So the site asks and is allowed, but macOS gives Chrome no position. The most likely cause is that Google Chrome is not ticked under System Settings, Privacy and Security, Location Services. This is not a bug in the app, but the app message did not say what to do.

## Fix

- `lib/locate.ts`: one shared reading for "Use my location" and the map's "Show my location". It asks with high accuracy first, then once more without it (laptops have no GPS).
- The search sheet and the map now tell "no position from the device" (with where to turn it on) apart from "too slow". English and German.
- Live directions say why they wait when the device gives no position.

## Checked

In a headless Chrome with a fake location that fails on purpose:

- No position twice: second try ran without high accuracy, the "turn on location" message showed.
- Too slow, then a position: the start was set to "Your location".
- Too slow twice: the "too slow" message showed.
- Map button with no position: the "turn on location" message showed.
- Directions with no position: "Finding your location..." plus the hint.
- No script errors. Build, lint and tests pass in the root and in `admin/`.

## Not checked

- The new messages on the owner's real Chrome, since the branch is not merged yet.
- Whether ticking Chrome in Location Services fixes it on the owner's Mac.
