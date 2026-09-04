# Loop 2 — readable units and useful content

News now keeps each serif headline, quiet source/age line and record-search chip together. Six headlines appear initially; More reveals the remaining live items, updates its accessible expanded state and allows collapse. No news pivot triggers a generated answer. The current live feed contains 12 items.

Just declared groups the latest six records by date, uses a date running head once per day, retains 48px portraits, and gives phone prose the full row width. Reports load independently of the daily feature's statistics and have six short, hairline-framed promos: a horizontal strip on phones, three columns on desktop.

## Capture review and corrections

All requested widths: zero document overflow, six initial news items, six report links, all six declarations retained. Report tiles reveal their neighbours and keep the native scrollbar; the final tile can be reached without moving the page sideways. Day rules now make repeated declarations legible as groups. Desktop maintains the two-column page composition.

The worst findings, fixed before the commit:

1. The existing broad news classifier treated explicit house-price and tobacco stories as party politics. A home-only helper now prioritises housing and tobacco phrases over incidental party names, while retaining the shared classifier's overseas classification. The shared classifier and other pages are unchanged.
2. Inline register links made quoted declarations break around an oversized inline control. Source links now occupy their own line with a 44px target, so the quote reads continuously.

Remaining critique: the full provenance paragraph below declarations is overlong for a front-page module; the miniature money card retains small row controls and annotations; long suggested-question labels still inherit shared truncation. Loop 3 will address scoped density/accessibility issues and explicitly record any shared boundary that cannot be changed here.

## Verification

`node --check portal/public/app.js` and `git diff --check` pass. No Worker changes. `page-home-loop2-*` captures cover all sections at 360×780, 390×844, 430×932 and 1280×900, plus expanded news, last report, map popover/card and footer. `page-home-loop2-fixed-*` records the reviewed corrections. Captures use the isolated static server with live read-only API data and Chromium/ANGLE/SwiftShader. All ask requests remain blocked by the harness.
