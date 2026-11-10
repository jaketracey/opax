# App icon

The masthead mark: the Australia map in `--bronze-bright` (#D9A84A) with the
ring of seven pale stars in `--on-navy-soft` (#B7C6D9), on `--navy` (#142A43).
Land and star paths are copied unchanged from the masthead mark in
`portal/public/index.html` (`.logo-mark`, viewBox 0 0 176 160), the same paths
`portal/src/og.ts` draws. Jake asked for the stars on 10 Nov 2026 so the icon
matches the website; they stay pale rather than gold, away from official
insignia. No text, no crest.

- `icon.svg` → `icon.png`: the default icon, opaque, no alpha channel.
- `icon-dark.svg` → `icon-dark.png`: gold land and pale stars on transparency; iOS supplies the dark ground.
- `icon-tinted.svg` → `icon-tinted.png`: white land and 70% white stars on transparency for the tinted appearance.

iOS 26 derives the clear appearance from these. To re-render after a change:

```sh
for n in icon icon-dark icon-tinted; do rsvg-convert -w 1024 -h 1024 $n.svg -o $n.png; done
magick icon.png -background '#142A43' -alpha remove -alpha off icon.png
```

Android uses separate adaptive layers: `android-foreground` retains the same
Australia paths in gold, `android-background` is opaque navy, and
`android-monochrome` supplies an alpha mask for Android 13+ themed icons. The
foreground is inset to stay inside the adaptive icon's central safe circle;
the launcher supplies the outer mask. Render their SVGs with the same command.
These assets affect only Android and still carry the land alone.
