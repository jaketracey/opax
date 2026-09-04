# OPAX report pages — three-loop report

## Outcome

All six standing reports now have a curated, brief-backed reading list; audited positions, speaker rankings and section prose; and a mobile-first report renderer. No deployment was performed. `portal/wrangler.jsonc`, knowledge-box configuration and enrichment tasks were not changed.

## Loop 1 — relevance and data

- Replaced the single generic key-moment search with eight subject sub-questions per report, each using `/find` at `top_k=20` with `kind/speech`, report-topic and real-text filters.
- Added named, unit-tested predicates for hollow headings, committee transcripts, short bodies, division/procedural text, motion stubs, points of order, question-on-notice answers, missing summaries and procedural summaries.
- Reads only the speech body and `da-summary-t-body` field for candidate hydration.
- Scores survivors by reranked retrieval score × `log(body length)` × evidence of a consequential role, then applies year/parliament spread with one speech per speaker.
- Emits cleaned debate title, speaker, party label when present, state, chamber, date, slug, machine brief, data-derived `why`, role and body length.
- Added `--only key-moments`, which preserves all prose and other report blocks.
- Regenerated 40 key speeches: climate 7, gambling 7, housing 6, immigration 6, First Nations 8 and media 6. The full evidence-led selection review is in `LOOP1.md`.

The original First Nations failures—an empty second-reading motion, `Bills`, a committee transcript and a division record—are no longer eligible.

## Loop 2 — the rest of the data

- Checked every party-position citation against the live resource, body, label and brief. Removed rows that stated the respondent's answer as the questioner's party position, relied on boilerplate or fragments, used the wrong party, or cited an unrelated/multi-speaker resource. Corrected the supported Wilkie, Faruqi and Bartlett summaries.
- Hardened `stats.top_speakers` against the legacy substring classifier. A speech now needs at least three report-specific whole-word/phrase hits, and normalized name variants are merged before ranking.
- Confirmed `stats.timeline` groups by `s.date`, the speech date, not Nuclia catalog index time.
- Added a direct-answer section prompt and regenerated all 16 sections. Every opening passed the stale-context-language check.
- Added `--only stats` so audited static stats can be embedded without replacing other blocks.

The per-report findings and retained/removed evidence are in `LOOP2.md`.

## Paid generation count

**16 total `/ask` calls.** All were successful section regenerations made by `scripts/generate_reports.py --only sections`:

- Climate 3
- Gambling 3
- Housing 3
- Immigration 2
- First Nations 3
- Media 2

Key-speech generation, field reads, position checking, stats work, validation and UI work made no `/ask` calls.

## Loop 3 — mobile-first UI

- Replaced numbered source rows with editorial speech units: serif debate title, existing portrait treatment, linked speaker, source-labelled party chip, parliament/date, serif machine brief and a 44px reading link.
- Added the selection-method fineprint and moved the reading list before the long analysis sections.
- Used whitespace and hairlines rather than nested cards.
- Fixed the render-order bug that cleared corpus totals from the figures column.
- Improved position-row separation, mobile figure citations, full donor/speaker labels and stacked section actions.
- Verified every report at 390px and the First Nations report at 1280px. No report produced horizontal overflow, and the audited report controls were 44px or taller.

The visual critique and capture inventory are in `LOOP3.md`. The scratchpad contains exactly 19 requested PNGs: three 390×844 captures for each report and one 1280×900 desktop reference.

## Regeneration and validation

Targeted regeneration commands:

```sh
python3 scripts/generate_reports.py --only key-moments
python3 scripts/generate_reports.py --only sections
python3 scripts/generate_reports.py --only stats
```

Only the second command uses `/ask`. The repeatable live-KB validation is:

```sh
python3 scripts/validate_reports.py
```

It passed for all six reports and all 40 selected slugs, asserting six to eight items per report, unique speakers, non-empty brief/date/speaker/slug fields and a matching live KB resource.

Final verification:

- `node --check portal/public/app.js`
- `python3 -m py_compile scripts/generate_reports.py scripts/report_stats.py scripts/validate_reports.py`
- `python3 -m pytest -q tests/test_generate_reports.py`
- `git diff --check`
- six JSON documents parsed successfully; 16 section openings passed the forbidden-context-language scan

## What to check by eye on a phone

- Long report and debate titles wrap without clipping.
- The lead remains comfortable to read and the key figures form clean two-column rows where space allows.
- Figure citations wrap legibly; position rows are clearly separated.
- Each reading-list entry reads as one unit, with portrait, identity, quiet metadata, brief and reading link in the right order.
- A missing historical party label is not replaced with a guessed current affiliation.
- Donor and top-speaker names show in full above their bars.
- Expanded section sources remain scannable, and section/download actions are full-width 44px targets.

## Commits

- `40885af` — rank substantive key speeches and add the retrieval/brief/predicate pipeline.
- `acc67ac` — regenerate and audit all six key-speech lists.
- `48760a5` — audit positions and stats, and regenerate the 16 report sections.
- `f634ad1` — redesign the mobile report reading experience and capture it at both widths.
- Final evidence commit — add the reusable live-KB validator and this report.
