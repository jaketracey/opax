# Launch artwork

The brand mark from `portal/public/favicon.svg` (the `--navy` #142A43 rounded
square with the `--bronze-bright` #D9A84A seven-point star, path copied
unchanged) above the "OPAX" wordmark in Merriweather Bold (the web's
`.site-wordmark`), outlined from `assets/fonts/Merriweather-Bold.ttf`. No
other text.

- `splash.svg` → `splash.png`, `@2x`, `@3x`: ink wordmark on a transparent
  200 x 120pt canvas; the launch screen paints paper (#FAF9F6) behind it.
  `app.config.ts` gives the plugin the `@3x` file at 200pt wide;
  `src/launch/LaunchHandoff.tsx` draws the same image in the same place.
- `splash-dark.svg` → `splash-dark@3x.png`: the star alone and a paper
  wordmark, for a navy ground. Not configured while the app is light-only
  (see `mobile/README.md`, "Launch and welcome tour").
- `mark.svg` → `mark.png`, `@2x`, `@3x`: the mark alone at 28pt, for the
  welcome tour's masthead.

To regenerate, from `mobile/`: `swift scripts/render-splash.swift`. It writes
the SVGs, then renders each PNG from its SVG with Core Graphics (macOS
frameworks only). Commit the SVGs and PNGs together.
