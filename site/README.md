# Landing page

The static home page of the browser version, published at
`maykawacode.github.io/chora/`. The app itself is published one level down, at
`/chora/app/`, so both start links on this page point to `app/`.

- `index.html`: the markup. The Content-Security-Policy meta tag keeps every
  request on this site, in the spirit of the app's `build/csp.ts`.
- `quick-start.html`: the Quick Start Guide, for first-time users, at
  `/chora/quick-start.html`. The app's Info menu links here.
- `images/`: the quick start's screenshots (`step-1`, `step-2`, `step-optional`,
  `step-3`, `step-4`, WebP at 2×). Taken from the browser version: a new study
  with six vegetables, two dimensions and three collections, names shown in the
  strip, each panel's divider raised. Steps 1 to 3 in a 760px-wide window, step 4
  at 960×680 with one Cartesian map and its sidebar. The button to click is
  circled in red. Retake one when its screen changes.
- `site.css`: the styles, with the `@font-face` declarations at the top.
  The quick start's styles are the last section.
- `site.js`: the walk-through animation and the card stills, loaded with `defer`.
- `fonts/`: IBM Plex Sans (400, 500 and 600 are the app's own files from
  `src/renderer/src/assets/fonts/`; 700 is for the wordmark) and Fraunces
  (variable, 300 to 600). Both are SIL Open Font License; see `fonts/LICENSE-*.txt`.
- `favicon.png`, `apple-touch-icon.png`: from `resources/build/chora-icon-source.png`.

The design source is `Output/2026-10-25_welcome-landing-prototype_v16.html` in
the project folder; this page is that design with its fonts, script and links
made ready to publish.

To preview locally, serve the folder rather than opening the file, so the
policy and fonts behave as they will on the site:

```sh
python3 -m http.server -d site 8080
```

Then open `http://localhost:8080/`. The `app/` links lead nowhere locally; they
work once the site and app are published together.
