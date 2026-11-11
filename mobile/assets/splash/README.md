# Launch artwork

The gold seven-point star from `portal/public/favicon.svg` (the `--bronze-bright`
#D9A84A path copied unchanged; the mark's navy square is not drawn because the
launch field is that navy) above the "OPAX" wordmark in Merriweather Bold (the
web's `.site-wordmark`), in paper #FAF9F6, outlined from
`assets/fonts/Merriweather-Bold.ttf`. No other text. The field is the brand
navy #142A43 in both appearances, painted by the launch screen
(`app.config.ts`), so one image serves light and dark.

- `splash.svg` → `splash@3x.png`: the star and the wordmark on a transparent
  200 x 120pt canvas, the native launch image. `app.config.ts` gives the
  plugin this file at 200pt wide and the plugin resizes its own 1x and 2x
  copies.
- `star.svg` → `star.png`, `@2x`, `@3x`: the star alone on its 60pt square,
  and `wordmark.svg` → `wordmark.png`, `@2x`, `@3x`: the wordmark alone on the
  same 200 x 120 canvas. `src/launch/LaunchHandoff.tsx` draws these two layers
  where the native image puts them, so hiding the native splash shows no seam,
  then animates them: the letters of the wordmark travel into the full name.
- `mark.svg` → `mark.png`, `@2x`, `@3x`: the mark alone (square and star) at
  28pt, for the welcome's masthead.

`src/launch/geometry.generated.ts` records where each glyph of the wordmark
sits on the canvas and the advances of the full name's words, from the same
layout and font, so the animation and the artwork cannot drift apart.

To regenerate, from `mobile/`: `swift scripts/render-splash.swift`. It writes
the SVGs, renders each PNG from its SVG with Core Graphics (macOS frameworks
only), and rewrites the generated geometry. Commit the SVGs, the PNGs and the
generated file together.
