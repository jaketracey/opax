# Reports v2 page — three-loop report

Implemented and committed on `reports-ui`, entirely within
`/Users/jake/Projects/opax/.claude/worktrees/reports-ui`. Not deployed.
`CACHE_EPOCH` untouched. No paid calls: report JSON is static, and the harness
refuses every `/api/*` path outright.

## Delivered

A v2 report is a different document from a v1 one. It states an argument, says
what parliament is making of it now, and shows how the argument moved to get
there. The page reads in that order.

1. **Head.** The window stated plainly ("The debate since July 2024, and how it
   has moved since 1993") above the lede, because which two spans are being
   compared is what a reader needs before the first sentence. Then the lede at
   reading size with its sources as true superscript citations, the note saying
   who wrote it, and the sources folded. A two-stop nav follows, sticky on
   phones at 45px — 44px of button and one hairline — and static above 700px.
2. **The debate now.** The discovered debates as chips, each opening its own
   search with the report's window applied and its tally in a column of its own.
   Then the sections as short essays: the question in the serif, the answer with
   its citations, the model note, and a folded reading list. Then the figures as
   tiles, each traced to the speech that said it, and where the parties stand.
3. **How it has moved.** Three eras on a hairline spine, each with its own essay
   and sources; the tide strip the topic pages already draw, on the report's own
   decade counts and captioned "labelled so far, not the whole record"; the key
   speeches as a reading list; and who is talking now against who has talked
   across the record, as two bar lists with portraits.
4. **The money**, with the corpus totals under a line of their own, then every
   speech behind the report, deduplicated and folded.

A report with no `version` still renders through `renderReportBrief()` exactly
as it did. Checked, not assumed: gambling renders its v1 brief, figures,
positions, moments and sections, with all four v2 containers hidden, at all four
widths.

## The three loops

- **Loop 1 — built, and read back against a fixture.** Ten faults: the nav did
  not stay (`position: sticky` bounded by the head it sat in); a source with no
  speaker drew an empty portrait circle and a party chip attached to nobody; the
  date sat inside the title in ISO; the provenance line was stranded between the
  nav and the first part; every fold summary was an inherited uppercase eyebrow;
  the chips cost 570px on a phone; "Read the speech" drew a floating rule under a
  44px box; a tile's source broke after its em dash; speaker links were 23px; and
  the first era opened with no air.
- **Loop 2 — the ten fixed, five more found.** The money part and the voices
  block ranked the same people from different counts; "The money beside the
  words" headed two tiles that are not money; a position's window read as an
  assertion about when the words were said and sat above a citation years older;
  a wrapping chip name pushed an interpunct to the head of a line; and the window
  line opened the lede rather than framing it.
- **Loop 3 — the first read against the reports the generator actually writes.**
  Eight faults a fixture could not have shown, because a fixture is only wrong in
  the ways its author imagined. Full detail in the loop file; the two that
  mattered most were the tide strip silently dropping its first and last decades
  (the decade arrives as a display label, not the Worker's key) and every essay
  folding twenty speeches under an answer built from five to eleven.

## Verification

`node --check portal/public/app.js` passed each loop.

Headless Chrome over CDP against a static server rooted in this worktree, with
an overlay directory carrying the two generated reports so no tracked file was
modified to test one. `/api/*` returns 403, so nothing here can reach the live
index and no generation call is possible.

The harness forces `prefers-color-scheme: light` and disables Chrome's
automatic dark mode. Without that, the desktop captures of the first run came
back dark while every computed style still read as paper: the browser had
repainted the capture, and the "finding" was a browser artefact.

At 360×780, 390×844, 430×932 and 1280×900, on First Nations and housing as v2
and gambling as the v1 control:

| check | First Nations | housing | gambling (v1) |
| --- | --- | --- | --- |
| horizontal page scroll | none | none | none |
| console errors from the page | none | none | none |
| tide bars drawn | 4 | 4 | n/a |
| essays / chips / figures / positions | 11 / 8 / 4 / 3 | 11 / 8 / 4 / 3 | n/a |
| eras / voices / key speeches | 3 / 16 / 8 | 3 / 16 / 6 | n/a |
| deduplicated sources at the foot | 190 | 202 | n/a |
| targets under 44px | 0 | 0 | 25 (pre-existing) |
| nav band, and pinned at 4000px | 45px, 60px | 45px, 60px | n/a |
| v2 parts shown | 4 of 4 | 4 of 4 | none |

The only console line at any width is a 403 on `/api/stats`, the site-wide
statistics call the harness refuses; it appears identically on the v1 control.
The only sub-44px targets are the v1 page's own party chips and the year columns
inside the money charts, both drawn for the homepage and topic pages too, and
outside this page's boundary.

The citation apparatus was proved end to end even though no generated report
currently exercises it. A copy of the First Nations report with plain `[n]`
markers injected into its prose rendered 66 superscripts, each a true
`vertical-align: super` at 11px with a 44px invisible halo and no leftover
bracket text. Clicking one filled its fold from empty to twenty rows, opened it,
scrolled to the right speech and offered "Back to the essay".

Boundaries held. The `app.js` diff is three hunks, all in the report region:
`renderStats` (called from `openReport` and nowhere else), the report helpers
beneath `renderReportBrief`, and `openReport` itself. `index.html` changes sit
between lines 600 and 630, inside `#panel-reports`. `style.css` is one appended
hunk after line 3315 under the requested banner, with no existing rule touched.
`scripts/` was not edited.

## Evidence and limits

Captures, the server and the probe harness are in
`/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/`.
`ui_server.py` serves the worktree with an overlay on port 8791; `ui_probe.py`
drives Chrome. Image names are `<tag>-<width>-<part>.png`; probe JSON sits
alongside.

Two limits are the generator's, not the page's, and both were raised with the
core agent:

- **No inline citation markers.** The generated `answer` and `lede.text` carry
  none, so the superscript apparatus never fires against real data and a reader
  cannot tell which speech backs which sentence. The page converts plain `[n]`
  markers automatically; nothing on this side needs to change.
- **No passage on a source.** The v2 source objects carry slug, title, speaker,
  party, state, date and `cited`, but no `snippet`. Only `over_time.key_moments`
  carries a `brief`, and only those rows read as evidence rather than as
  pointers. The page renders `snippet` or `brief` on any row that has one.

Both exemplars were still under review when this was built, so small changes to
them are expected. Nothing in the page depends on a value in them, only on the
shape.

The head runs to about 1858px at 360 before the first essay: a 760-character
lede, the window line, the fold, the nav, the part heading, its note, and 485px
of chips for eight discovered debates. Every part of that is something the
reader asked for, but eight full-width chips is the largest block before any
argument starts and is worth watching if a report ever discovers twelve.

## Check on a real phone

- Safari and Chrome: scroll the full length of a v2 report and confirm the two-stop
  nav stays put under the masthead without eating a second band.
- Open a source fold from the middle of a long essay and check the reading
  position when twenty rows appear at once.
- VoiceOver/TalkBack: the chips' accessible names carry the full debate title and
  its span; the tide bars read as "1993–99: 4.7% of the labelled speeches, 791 of
  16,946 labelled so far".
- Enlarged text at 360: the figure tiles and the position lines are the two places
  where a long label has the least room.

## Commits

- `263e3b1` — the debate now, and how it has moved
- `db42a00` — the nav holds, and a source row leads with the record
- `6e5d882` — one league table, one line for the corpus, and a position's window as scope
- `1909075` — against the real reports: the tide keeps its bars, a figure keeps its grammar, a fold says what it cited
- `e054a0c` — a citation the size of a tile, an era that says its span once, a debate named once per run
