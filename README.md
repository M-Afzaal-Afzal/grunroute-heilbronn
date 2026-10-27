# GrünRoute Heilbronn, Next.js prototype

Tagline: Cooler, cleaner, and safer streets for Heilbronn.

GrünRoute Heilbronn turns existing bike, school, and heat data into a ranked plan for the city, so it can fix the hottest, dustiest, and least safe streets first. The same evidence gives residents a simple web map for cooler, cleaner, and safer routes, with no app, sign-up, or personal tracking.

Street scores here are an ATRAI sample, not a full city ranking, and not official measurements. This is a screening tool only, not official legal measurements.

## Brand

The full brand kit lives in `brand/`. Read `brand/BRAND.md` first.

- Logo: **Fix Point**. The u of Grün drawn as a street route that bends and stops under a target point, the street to fix first. Code version in `components/brand/Logo.tsx`, favicon and app icons in `app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png`. Source SVGs in `brand/logo/`.
- Colours: Neckar ink #0F2A23, Grün #12A150 (route, graphics only), green text #0B7A3E, mint #8EE6A8 (accent on ink), paper #F4F7F5. Fix score colours are for data only: fix soon #C8322B, plan next #B86E00, check later #4E8C72. Heat #C2410C is reserved for heat warnings.
- Type: Barlow Semi Condensed 700 and 800 for headlines, street names and scores, Barlow 400 to 700 for body text, both self hosted through `@fontsource`. Body text at least 16px.
- Social: profile pictures, banners, posts, story, link preview and a title card in `brand/social/`. `app/opengraph-image.png` is the link preview.

## UI components

The home page uses its own markup in `app/page.tsx` styled by `app/globals.css`. Components in `components/ui/` are shadcn style, hand built with the same look and API shape: Button, SegmentedTabs (For the city / For people), Card and ClickableCard (street cards), Badge (WEAK EVIDENCE and data support), BottomSheet (mobile list peek, non modal, map stays interactive), Input (street search), Select (fix type and route places), and Skeleton (live panel loading). Tailwind CSS is used for styling tokens and layout utilities, with the main layout in `app/globals.css`.

Why hand built: a full Radix based shadcn install would add extra runtime weight and risk around the Leaflet map, and the task allows clean shadcn style hand built components with the same look when a library would slow the build or break the map. The result keeps tap targets at least 44px, body text at least 16px, no horizontal overflow at 390px, no heavy animations, no sliders, no carousels, and no popups in the hero.

Subtle 21st.dev and Aceternity style touches only: clean cards, soft shadows, clear teal focus rings, and a restrained leaf to teal gradient on the proof chip. No hero decoration pushes the headline, switch, proof chip, or map below the fold.

## Live data note

The openSenseMap list endpoint returns `lastMeasurement` as an ID only, not a value. The Live now panel therefore fetches the list, then fetches detail for the 5 most recently updated boxes near Heilbronn, where each sensor carries a real value and timestamp. It also matches the German sensor title "Temperatur" as well as "temp". Fetched text is rendered as React text, never as raw HTML, so it is escaped by React. A single live point never changes a street score. The panel turns grey when data is stale over 2 hours old or the fetch fails.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Build

```bash
npm run build
npm run start
```

## Deploy with GitHub and Vercel

1. Push this project to a GitHub repository, on the main branch.
2. In Vercel, choose Add New Project, then Import the repository.
3. Keep the default settings, then click Deploy.
4. Every push to main auto deploys to production. Other branches and pull requests get unique preview URLs.

No secrets, API keys, or passwords are needed for this prototype. The live panel uses only the public openSenseMap API from the browser.
