# App icon

The masthead mark: the Australia map in `--bronze-bright` (#D9A84A) with the
ring of seven pale stars in `--on-navy-soft` (#B7C6D9), on `--navy` (#142A43).
The land paths are copied unchanged from the masthead mark in
`portal/public/index.html` (`.logo-mark`, viewBox 0 0 176 160). The stars keep
the masthead's seven positions but are redrawn (Jake chose direction A, "refined
ring", 10 Nov 2026): four rays with concave sides tapering to fine points, a
deliberate size order with the anchor star at the top, and unequal pairs so the
ring never reads as a wreath. Their paths, in mark units, are kept in
`stars-a.txt` for the website mark. The stars stay pale rather than gold, away
from official insignia. No text, no crest.

- `icon.svg` → `icon.png`: the default icon, opaque, no alpha channel.
- `icon-dark.svg` → `icon-dark.png`: gold land and pale stars on transparency; iOS supplies the dark ground.
- `icon-tinted.svg` → `icon-tinted.png`: white land and 70% white stars on transparency for the tinted appearance.

iOS 26 derives the clear appearance from these. To re-render after a change:

```sh
for n in icon icon-dark icon-tinted; do rsvg-convert -w 1024 -h 1024 $n.svg -o $n.png; done
magick icon.png -background '#142A43' -alpha remove -alpha off icon.png
```

Android uses separate 1024px adaptive layers. `android-foreground` takes the
Australia and seven refined-ring stars from `icon-dark.svg`, all in gold.
`android-background` is opaque navy, and `android-monochrome` is the same
foreground in white for Android 13+ themed icons. The mark is scaled to 75%
about the centre, keeping every painted pixel inside the central 66/108 safe
circle (radius 312.89px). The launcher supplies the round or squircle mask.
Render these three SVGs with the same `rsvg-convert` command above. These
layers affect only Android; the iOS source art and PNGs are unchanged.

`play-icon-512.png` is the full default star-ring art on opaque navy, without
a baked-in launcher mask or shadow: 512 × 512, 32-bit RGBA PNG, alpha 255
everywhere. Re-render it with `rsvg-convert -w 512 -h 512 icon.svg`, then
encode with `pngjs` (`PNG.sync.write(image, { colorType: 6 })`) to retain
32-bit colour even though the artwork is opaque. The asset test checks its
dimensions, colour type and opacity, and the adaptive layers' safe circle.
