# More photographs for "The year in pictures": report

Branch `ui-pictures2`, three sittings on 2026-09-05 (the session was interrupted
twice by usage limits and resumed each time from the committed state). Work was
data-only: no site code changed, `CACHE_EPOCH` was not touched, and nothing was
deployed.

## Pictures per year, before and after

| Year | Before | After | Year | Before | After | Year | Before | After |
|---|---:|---:|---|---:|---:|---|---:|---:|
| 1998 | 1 | 4 | 2009 | 4 | 7 | 2019 | 4 | 6 |
| 1999 | 3 | 4 | 2010 | 4 | 7 | 2020 | 4 | 6 |
| 2000 | 4 | 7 | 2011 | 4 | 7 | 2021 | 1 | 8 |
| 2001 | 3 | 6 | 2012 | 4 | 7 | 2022 | 4 | 6 |
| 2002 | 0 | 7 | 2013 | 4 | 7 | 2023 | 4 | 6 |
| 2003 | 4 | 7 | 2014 | 4 | 7 | 2024 | 4 | 6 |
| 2004 | 4 | 7 | 2015 | 4 | 7 | 2025 | 4 | 6 |
| 2005 | 4 | 7 | 2016 | 4 | 7 | 2026 | 4 | 7 |
| 2006 | 1 | 7 | 2017 | 4 | 7 | | | |
| 2007 | 4 | 7 | 2018 | 4 | 6 | | | |
| 2008 | 4 | 6 | | | | | | |

**Total: 101 to 189 photographs** across the same 29 years (1998–2026). The "before"
counts come from the manifest as committed at `190f23b`, the last commit before this
brief's work began; they differ slightly from the stale summary table that was in
`docs/PICTURES.md` at the time (which had not been kept in sync with 1999, 2006 and
2021's true counts). `node portal/test/pictures.test.mjs` passes; the pictures
directory is 22.7 MiB, under the 40 MiB budget.

## Years still short of six

**1998 and 1999**, both still at four. Both were re-searched exhaustively in this
pass — file search, category search and category recursion, plus one-off targeted
queries for the GST, native title, the Telstra sale, the republic referendum, aged
care, the Constitutional Convention and Jabiluka — and returned nothing usable:
only election-result maps, an election poster, unrelated CSIRO fire-science images,
and East Timor frames that were either already shipped or actually dated 2000 (the
INTERFET-to-UNTAET handover phase, already covered under 2000). No compliant,
on-topic, safe photograph of any other 1998 or 1999 event exists on Commons under
the allowed licences. Nothing was substituted to reach the target.

## Firecrawl

**0 calls**, for this pass and the first pass combined. Every discovery and
verification request went to the public, unauthenticated Wikimedia Commons API
(`commons.wikimedia.org/w/api.php`); Commons search and category traversal were
sufficient to find and verify every photograph, so the Firecrawl credential was
never read or sent. `docs/PICTURES.md` records the Commons request shapes and the
searches made.

Note on the resume instruction to "count Firecrawl calls conservatively... assume
150 were used": no evidence of any Firecrawl call was found in retained scratchpad
logs, harvest scripts, or the pre-existing `docs/PICTURES.md` Firecrawl section
(which independently records 0 for the first pass). This report follows the
evidence rather than the precautionary assumption; the true count for this whole
project, both passes, is 0.

## Licences used (all 189 photographs)

| Licence | Count |
|---|---:|
| Public domain | 51 |
| CC BY-SA 4.0 | 30 |
| CC BY 2.0 | 28 |
| CC BY-SA 3.0 | 23 |
| CC BY 3.0 | 19 |
| CC BY-SA 2.0 | 13 |
| CC BY 4.0 | 12 |
| CC0 | 9 |
| CC BY-SA 2.5 | 4 |

Every licence is on the allow-list (`Public domain`, `CC0`, or any version of
`CC BY`/`CC BY-SA`); each entry's licence, licence URL, Commons file page and
original upload URL were re-checked live against the Commons API immediately
before the file was downloaded, independent of the value recorded when it was
first found as a candidate.

## Method

Wikimedia Commons only, via `generator=search` and `categorymembers`, filtered to
`Public domain`, `CC0`, and any `CC BY`/`CC BY-SA` version in
`extmetadata.LicenseShortName`. A small Python toolchain in the scratchpad
(`commons.py`, `list.py`, `q.py`, `sheet.py`, `desc.py`, `ingest.py`) harvested
candidates, triaged them as compact text and contact sheets, re-verified licences
live, resized to at most 1600px, encoded WebP at quality 82, and appended manifest
entries. Every accepted photograph was inspected in a contact sheet before
shipping, including the nine added in this final session (2019, 2020, 2022 and
2026). This pass's specific rule was series diversity: where a year already had
photographs from one event or photographer, additions were required to come from a
different event, date or photographer, so 2019, 2020, 2022 and 2026 each closed on
three distinct stories rather than one story repeated.

## Summary

The gallery grew from 101 to 189 photographs, and every year from 1998 to 2026 now
holds at least four, with 27 of the 29 years at six to eight. 2002 went from zero
photographs to seven, carried by Australian forces in the Gulf and East Timor and
diplomatic talks abroad, since no compliant photograph of the Bali bombings,
Woomera or the drought exists under a free licence. 1998 and 1999 remain at four
after exhaustive re-searching turned up nothing else usable. The last session's
work closed 2019, 2020, 2022 and 2026 by adding nine photographs across three
distinct events per year: a 2019 election-day photo and Black Summer bushfire
smoke; a 2020 bushfire-aftermath photo and Black Lives Matter rally; a 2022
Brisbane flood photo and a State of the Environment report protest; and, for 2026,
a South Australian election forum, the State Opening of the SA Parliament and a
student protest against Pauline Hanson. All 189 photographs are Wikimedia Commons
originals under an allowed free licence, re-verified live before shipping. No
Firecrawl call was made in either pass. The manifest test passes and the pictures
directory holds 22.7 MiB, well inside the 40 MiB budget.
