# GrünRoute Heilbronn, Next.js prototype

Tagline: Cooler, cleaner, and safer streets for Heilbronn.

GrünRoute Heilbronn turns existing bike, school, and heat data into a ranked plan for the city, so it can fix the hottest, dustiest, and least safe streets first. The same evidence gives residents a simple web map for cooler, cleaner, and safer routes, with no app, sign-up, or personal tracking.

Street scores come from the measured ATRAI street network (11,319 segments, grouped into 1,086 streets), the city tree register, the summer heat walks, and Unfallatlas crashes. They are not official measurements. This is a screening tool only.

## Two apps

| App | Folder | For | Production URL |
|---|---|---|---|
| GrünRoute | repo root | residents | https://grunroute-heilbronn-ebon.vercel.app |
| GrünRoute Planner | `admin/` | city staff | https://grunroute-planner.vercel.app |

- The people app has a trip planner from any start to any end, live directions with voice and beeps, the read only layer "Streets the city should look at", and the pages `/play` (Hot or not?), `/measure` (Help measure), `/districts` (District league), and `/data-collection`. Fair mode is `/?fair=1`.
- The Planner has the fix first ranking with presets and sliders, heat maps, shade and trees, data and missions, street dossiers, and a Live page.
- The people app does not link to the Planner. The Planner links to the people app.
- Shared code lives in the root `lib/`. `admin/scripts/sync-shared.mjs` copies it into `admin/lib/shared/` before dev, build, and test. Edit the root copy only.

## Security note

Planner Basic Auth (`admin/proxy.ts`) is a demo gate, not real security. It is on only when `ADMIN_USER` and `ADMIN_PASSWORD` are set as Vercel environment variables. One shared password, no accounts, no audit log, no lockout. A real rollout needs the city's SSO. Never write the values in files or chat.

The people app needs no secrets. Live directions keep the location in the browser, except the start and end points sent to OSRM, and store no track.

## Brand

The full brand kit lives in `brand/`. Read `brand/BRAND.md` first.

- Logo: **Fix Point**. The u of Grün drawn as a street route that bends and stops under a target point, the street to fix first. Code version in `components/brand/Logo.tsx`, favicon and app icons in `app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png`. Source SVGs in `brand/logo/`.
- Colours: Neckar ink #0F2A23, Grün #12A150 (route, graphics only), green text #0B7A3E, mint #8EE6A8 (accent on ink), paper #F4F7F5. Fix score colours are for data only: fix soon #C8322B, plan next #B86E00, check later #4E8C72. Heat #C2410C is reserved for heat warnings.
- Type: Barlow Semi Condensed 700 and 800 for headlines, street names and scores, Barlow 400 to 700 for body text, both self hosted through `@fontsource`. Body text at least 16px.
- Social: profile pictures, banners, posts, story, link preview and a title card in `brand/social/`. `app/opengraph-image.png` is the link preview.

## UI components

Pages use their own markup styled by `app/globals.css`, with Tailwind CSS for tokens and small utilities. The people app keeps three shadcn style primitives in `components/ui/`: Button and Badge (Collect data page) and Select (Radix, used for every select). The Planner has its own set in `admin/components/ui/`.

Tap targets are at least 44px, there is no horizontal overflow at 390px, focus rings are visible, and big JSON files load on demand with a skeleton.

## Live data note

`lib/live.ts` asks openSenseMap for boxes in a bounding box around Heilbronn with `full=true`, so each sensor carries its last value and time, then keeps only boxes inside the city boundary and drops values below 0. The bbox is rounded outward with one retry, since the exact bbox sometimes returned a cut off answer. It matches the German sensor title "Temperatur" as well as "temp". Fetched text is rendered as React text, never as raw HTML, so it is escaped by React. A single live point never changes a street score. Data older than 2 hours is shown as stale.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. For the Planner, run the same commands inside `admin/`.

## Check before pushing

Run `npm run build`, `npm run lint`, and `npm test` in the root and in `admin/`.

## Build

```bash
npm run build
npm run start
```

## Deploy with GitHub and Vercel

1. Push this project to a GitHub repository, on the main branch.
2. In Vercel, choose Add New Project, then Import the repository.
3. Keep the default settings, then click Deploy. For the Planner, import the same repository as a second project and set the root directory to `admin`.
4. Every push to main auto deploys both projects to production. Other branches and pull requests get unique preview URLs.

The people app needs no secrets, API keys, or passwords. The live panel uses only the public openSenseMap API from the browser. The Planner's two optional env vars are described in the security note above.
