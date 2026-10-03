# App icon

The Australia mark alone, in `--bronze-bright` (#D9A84A) on `--navy` (#142A43):
IOS-APP.md decision 2 and IOS-UX.md section 5. The land paths (mainland and
Tasmania) are copied unchanged from the masthead mark in
`portal/public/index.html` (`.logo-land`, viewBox 0 0 176 160). The arc of
stars is dropped: it blurs at small sizes, and gold stars on navy lean towards
official insignia. No text, no crest.

- `icon.svg` → `icon.png`: the default icon, opaque, no alpha channel.
- `icon-dark.svg` → `icon-dark.png`: gold land on transparency; iOS supplies the dark ground.
- `icon-tinted.svg` → `icon-tinted.png`: white land on transparency for the tinted appearance.

iOS 26 derives the clear appearance from these. To re-render after a change:

```sh
for n in icon icon-dark icon-tinted; do rsvg-convert -w 1024 -h 1024 $n.svg -o $n.png; done
magick icon.png -background '#142A43' -alpha remove -alpha off icon.png
```
