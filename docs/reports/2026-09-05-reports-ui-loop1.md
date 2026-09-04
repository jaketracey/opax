# Loop 1 — the v2 report page, built and read back

## What was built

A v2 report is a different document from a v1 one. It states an argument, says
what parliament is making of it now, and then shows how the argument moved to
get there. The page now follows that order:

1. **Head** — the title, the lede at reading size with its sources as true
   superscript citations, the window stated plainly ("The debate since July
   2024, and how it has moved since 1993"), and a two-stop nav.
2. **The debate now** — the discovered debates as chips that open their own
   search with the window applied; the sections as short essays, each with its
   question in the serif, superscript citations and a folded reading list; the
   key figures as tiles whose label completes the sentence the number starts;
   where the parties stand.
3. **How it has moved** — three eras on a hairline spine, the tide strip the
   topic pages already draw, the key speeches, and who does the talking now
   against who has done it across the record.
4. **The money**, then every source deduplicated and folded.

A report with no `version` still renders through `renderReportBrief()`, and the
v2 parts stay hidden. That was checked, not assumed: housing (v1) renders one
brief, eight figure tiles, two position rows, six reading-list entries and three
sections, with all four v2 containers hidden and no console output.

Built against a fixture (`indigenous.json` with invented v2 fields, marked as
such at its top level) because the real v2 reports have not landed yet.

## Critique

Ten faults, in the order they cost the reader most.

1. **The nav does not stay.** `position: sticky` is bounded by its containing
   block, and the nav sits inside the head, which ends a line later. It scrolls
   away with the head and never pins. It has to be a direct child of the
   article to hold for the length of the page.
2. **A source with no speaker renders as furniture.** Many records carry a null
   `speaker` and a title that holds the name anyway. The row draws an empty grey
   circle, a party chip with nobody attached, and "Graham Perrett — Parliamentary
   Representation — 2025-02-10" as though the ISO date were part of the subject.
   The row has to lead with whatever the record actually has.
3. **The date is shown as machine text or not at all.** Those same records have
   a null `date`, so the meta line reads "Federal" and the date sits inside the
   title in ISO. It should be lifted out and set the way the rest of the site
   sets a date.
4. **The provenance line is stranded.** "Generated 4 Sep 2026 · every claim cited
   to the record · corpus v2026-09-04" now falls between the nav and the first
   part, belonging to neither.
5. **Every fold summary is an uppercase eyebrow.** Inherited from
   `.chat-sources > summary`, which sets `text-transform: uppercase`. The house
   register forbids new ones, and "SOURCES FOR THIS OPENING (3)" is one.
6. **The discovered debates cost 570px on a phone.** Five two-line full-width
   pills push the first essay past three screens. The chips are the shape of the
   argument and should be readable in one glance, not scrolled through.
7. **"Read the speech" draws a floating rule.** The border-bottom sits at the
   base of a 44px inline-flex box, well clear of the text it belongs to.
8. **The tile source breaks after its em dash.** `#report-view .tile-source a` is
   `inline-flex`, so the "— " prefix is orphaned on its own line above a link
   whose text is a raw "Anthony Albanese — 2020-02-12".
9. **Speaker links in source rows are 23px.** Under the 44px minimum the rest of
   the page holds to.
10. **"How it has moved" opens too tight.** The first era's dot sits directly
    under the part heading with no breath between them.

## What was checked

Headless Chrome over CDP against a static server rooted in this worktree, with
an overlay directory carrying the fixture. `/api/*` is refused by the server, so
nothing here can reach the live index and no generation call is possible.

At 360×780, 390×844, 430×932 and 1280×900:

| check | result |
| --- | --- |
| horizontal overflow | none at any width |
| console errors and warnings | none |
| nav band height | 45px (44px of button, one hairline) |
| citations wired | 14 |
| essays, chips, tiles, positions | 5, 5, 3, 4 |
| eras, tide bars, voices, reading list | 3, 4, 10, 8 |
| deduplicated sources | 26 |

Captures: `reports-ui-loop1-v2-<width>-<part>.png` and the v1 control
`reports-ui-loop1-v1-housing-<width>-<part>.png`.
