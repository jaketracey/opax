# Portrait gaps, 14 November 2026

At base `b65d87783`, the folded roster has 1,565 profiles, 701 without a portrait
mapping, including 34 marked current. Claire Clutterham already has a mapping in
that base. This pass adds **97 mappings and 67 portrait files**. Afterwards,
**604 profiles remain blank, including 30 marked current**. Existing mappings and
portrait bytes are unchanged. Every new WebP has a JPEG twin.

## Classification and result

The four requested classes do not exhaust the gaps: identified parliamentarians
without a Wikidata P18 are an availability problem, so they are reported separately.
Classes are disjoint and refer to the original 701 rows.

| Class | Before | Mapped | Still blank |
|---|---:|---:|---:|
| (a) Verified alias or print with an existing local portrait | 26 | 26 | 0 |
| (b) Current-marked row with an identified Wikidata item and Commons image | 6 | 4 | 2 |
| (c) Other row with a dated Wikidata match and Commons image | 93 | 67 | 26 |
| (d) Unresolved, ambiguous or unsafe print | 259 | 0 | 259 |
| Identified through dated Wikidata service, but no P18 | 317 | 0 | 317 |
| **Total** | **701** | **97** | **604** |

Class (c) includes state members whose roster does not set `current`, as well as
former members. It does not assert that everyone in that class has left parliament.
Class (d) includes mixed witness prints, committee-only records, contradictory
chambers or full names, and candidates lacking dated evidence. No private witness
names are reproduced here.

[The mapping review](../../scripts/portrait_review_2026-11-14.json) records all 97
added prints, their keys, Wikidata sources, speech years and dated P39 positions.
The name or reviewed alias must agree, and dated service must cover the print's
years in every house it speaks in. Surname candidates are counted even when they
have no image. A birth year or the roster pid alone is insufficient.

The 26 local mappings are Aitchison, Brereton, Buckingham, Chapman, Cook, Franklin,
Gardner, Grant, Griffin, Harris, Harrison, Higginson, Lane, Lynch, O'Byrne, O'Connor,
Park, Parker, Rex Patrick, Sciacca, Singh, Sophie Panopoulos, St Clair, Warren, Watson and Wilson.
Rex Patrick uses his existing numeric file, independently checked against his
2017-2022 Senate service and Handbook record. Sophie Panopoulos reuses Sophie
Mirabella's existing numeric file after checking the dated Indi alias. The other
24 use existing credited Wikidata files. No existing official portrait was downloaded or recropped.

Four current rows gain portraits: Benjamin Hood, Hilton Gumbys, Melanie Selwood
and Mira El Dannawi. Reviewed alternate names include A. Koutsantonis (Tom),
A. Piccolo (Tony), Kathryn Sullivan (Kathy, Moncrieff) and Sophie Panopoulos
(Sophie Mirabella, Indi). Their exceptions are recorded under `photo_aliases` in `person_identity.json`;
that section is read only by the portrait check and cannot assign roster ids.

## Ambiguous and withheld candidates

| Print or person | Why it stays blank |
|---|---|
| Butler | Roy Butler and Liza Butler both have dated NSW Assembly service covering 2025-2026. Liza has no P18; an image-only query wrongly makes Roy look unique. No seat evidence separates the print. |
| Kelly | Joe Kelly and Glen Kelly both have dated Queensland Assembly service covering 2024-2026. |
| Wortley | The row says SA House but its `full` says Russell Wortley, a Council member. Dana Wortley has House service. The conflicting full name must be resolved before assigning either face. |
| J.M.A. Lensink | The print includes both SA houses; the reviewed Michelle Lensink identity establishes Council service only. |
| Cox, McKenzie, Price, T Smith | Mixed witnesses, houses, jurisdictions or eras prevent a single-person attribution. In particular David and Dorinda Cox, Bridget and Zoe McKenzie, the different Prices, and Tim and Tony Smith must remain separate. |
| Rose Jackson | The available portrait candidate has no dated P39 term in the queried evidence. Birth year alone is insufficient. |
| Crawford | Craig Crawford's dated term ends in 2024 while the print runs through 2026. |
| Phillips, Sterle, Bilyk, Gatenby | Committee-only prints without a verified house record. Gatenby remains one of the 30 current-marked gaps. |
| Hugh McDermott, Hugh Mcdermott, McDermott; Langbroek | Commons reports only the bare `Attribution` licence. No explicit free licence was established. |
| Emma Comer; Adem Somyurek | Commons metadata gives an APH or Victorian parliament source. Not used. |
| Marise Payne; James Milligan | The conservative provenance guard flags parliament references in image descriptions. Left for a separate provenance review, rather than treating a licence tag as sufficient. |
| David Farley | The same group image excluded by the previous reviewed pass remains on P18. Its existing exclusion was retained without downloading it again. |

YuNet excluded another 14 group images, affecting 19 candidate prints. The public
figures are Adam Searle, Ben Carroll, Brent Mickelberg, Christine Couzens, Dennis
Hood, Gary Maas, Liesl Tesch, Marlene Kairouz, Niall Blair, Nick Staikos, Susan
Carter, Tim James, Trung Luu and Victor Dominello. Their shorter or alternate
prints remain blank too. No group-image exclusion was overridden. All 67 retained
crops were inspected on contact sheets.

The other current-marked gaps with no P18 are Alice Jordan-Baird, Alison Penfold,
Ash Ambihaipahar, Ben Small, Cameron Caldwell, Carlos Quaremba, Carol Berry, David
Batt, David Moncrieff, Gabriel Ng, Jamie Chaffey, Jess Teesdale, Jessica Collins,
Julie-Ann Campbell, Kara Cook, Lynda Voltz, Madonna Jarrett, Mary Aldred, Matt Gregg,
Rebecca Hewett, Rowan Holzberger, Sean Bell, Simon Kennedy, Tom French, Tom Venning,
Trish Cook and Zhi Soon. The existing article-image work is documented in
[PHOTOS.md](../PHOTOS.md); this round uses Commons images linked by Wikidata P18.

## Sources, licences and assets

There were **100 portrait-source requests: 13 to Wikidata and 87 to Commons**.
The Commons total is five metadata calls and 82 image downloads; 14 downloaded
group images were discarded. One other download was superseded by the verified
local Panopoulos/Mirabella alias. **No refusals or challenges occurred.** Three early
thumbnail attempts were stopped locally before a request because the explicit
host list lacked Wikimedia's thumbnail host; after adding that legitimate host,
the current-member metadata request was repeated. Those local rejections are not
network requests. A separate identified request obtained the public YuNet model.
No APH, ParlInfo or OpenAustralia endpoint was requested.

`portrait_http.py` subclasses the existing `source_http.Session`, retaining its
User-Agent, challenge checks and redirect policy. Requests are serial, at least
one second apart, with a shared ignored ledger and a 300-request Commons budget.
The first 403, 429 or challenge terminates the run and prevents the following
pipeline stages from making more requests. In particular, 429 is never retried.

New-file licences: CC BY-SA **33**, CC BY **23**, CC0 **4**, public domain **7**.
The review JSON gives each version and jurisdiction. Full artist, credit and
attribution values are retained without truncation, with Commons file and licence
links in `photos/credits.json`. Crops retain their source licence. NC, ND and vague
CC tags fail the licence check.

The existing fetch and recrop scripts were run with `--new`. API thumbnails are
cached as recrop sources, avoiding a second download and a Special:FilePath
redirect. YuNet uses one thread. All new files are 200 by 200 WebP at quality 82,
2,922-9,196 bytes (median 5,528 bytes).
`npm run og:portraits` rebuilt JPEG twins. Asset stamps were rebuilt and checked;
no entry-asset bytes changed. Search and crawl catalogues do not embed portrait
keys. Their missing generated assets, report records and hubs were built locally
to run the full portal suite in a fresh checkout; no catalogue changes are part
of this commit. No roster, live database, KB or production data was written.

## Validation

* Python photo/roster gate: **211 passed, 14,184 subtests passed**.
* Latest focused roster identity, candidate, transport and licence checks:
  **22 passed, three subtests passed**.
* Portal photo identity, person identity and OG portrait tests: **22 passed**.
* Strict shipped-photo identity audit, asset stamp check and `git diff --check`:
  **passed**. All 67 new files have the expected dimensions and JPEG twins.
* `cd portal && npx tsc --noEmit`: **passed**, after generating the ignored local
  Worker types.
* Full `npm test -- --test-concurrency=4`: **4,907 passed, 11 skipped, zero failed
  or cancelled** (4,918 tests total).

Commands use `nice -n 10`. The shared host exceeded load5 40 during earlier runs,
so our tests were stopped. A fresh uninterrupted run uses `GOMAXPROCS=2` and
`UV_THREADPOOL_SIZE=1`, retaining test concurrency four. Missing generated assets
were built before the final run. No generated catalogue or unrelated growth
changes are included.

An additional shared-HTTP suite returned **50 passed, three failed** outside the
portrait checks: repository-wide source-guard findings, existing direct-fetch
callers, and an old fixture that expects incidental Cloudflare script markup to
be a challenge. A stable guard rerun confirmed the repository findings. All
reported paths, the shared transport, its tests and the guard are unchanged from
the base. The portrait-specific tests separately confirm immediate 403, 429 and
challenge refusal, persistence across stages, the request budget and pacing.
