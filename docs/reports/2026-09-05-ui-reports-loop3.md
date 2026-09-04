# Loop 3 — mobile-first report UI

## Critique

The old reading list reused the generic numbered source-row component. It reduced a substantial speech to a title and a metadata line, gave readers no machine brief, carried no visual speaker cue, and made the list look like footnotes rather than a considered way into the record. On a phone, the rest of the page also had three practical weaknesses: party positions ran together without row boundaries, section actions could compete for one line, and donor/speaker chart labels were truncated into a narrow first column.

The renderer also inserted corpus totals before `renderReportBrief()`, which immediately cleared the figures container. Those totals never survived to the displayed page.

## Fixes

- Replaced the numbered source list with a continuous editorial reading list. Each entry has its debate title in the serif, the existing speaker-portrait treatment, linked speaker, party chip when the KB record carries a party label, parliament and date, the machine brief at reading size, and a 44px “Read the speech” link.
- Added the selection note in the existing fineprint voice: “Chosen from the labelled record: substantive speeches on the subject, one per speaker, across the years.”
- Used only whitespace and hairline rules between speeches—no nested cards or new eyebrow style.
- Moved the reading list before the long analytical sections so it remains a practical starting point rather than an appendix.
- Reordered report rendering so the corpus totals append after the evidence figures have been built. All key figures and corpus totals now remain visible.
- Added hairline boundaries and a full reading line-height to party positions.
- Made report links, source disclosures, section actions, chart-name links and downloads at least 44px high. Section actions stack full-width at phone size.
- Kept key figures in a compact two-column flow where they fit, increased their citation text to a readable size, and changed mobile donor/speaker rankings to full-width name/value rows with the bar below. Long donor names no longer truncate.
- Added phone-specific headline and prose sizing while preserving the wide-screen lead/figures split and sticky figures column.

Missing party labels are not inferred from a current-person directory: a number of older and state KB resources genuinely have no `party` classification. Those entries retain the portrait, speaker and parliament/date line without inventing a historical affiliation.

## Browser checks

At both 390px and 1280px, all six pages stayed within the viewport (`scrollWidth == innerWidth`). At 390px, the report-specific interactive selectors tested at 44px or taller. Every report displayed the expected reading-list count and the evidence/corpus figure tiles; portraits resolved for every selected speaker in the First Nations check. Expanded section sources, position rows, charts and the desktop lead/figures split were also inspected.

## Captures

All captures are in:

`/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/`

For each of `climate`, `gambling`, `housing`, `immigration`, `indigenous` and `media`:

- `reports-loop3-<slug>-top-390.png` — 390×844
- `reports-loop3-<slug>-list-390.png` — 390×844
- `reports-loop3-<slug>-section-390.png` — 390×844

Wide-screen reference:

- `reports-loop3-indigenous-page-1280.png` — 1280×900
