# Federal interests refresh: 3 October 2026 rehearsal

Jake authorised the existing Firecrawl key and this pipeline fix. The candidate is
on `pipeline/interests-refresh`; it has not been pushed, merged or deployed. All
fetch/parse/load/export rehearsals used `/home/ubuntu/interests-rehearsal-20261003`
on **opax-refresh only** (`i-0d725823966c827b9`, default shared AWS account).
No full nightly was invoked by hand, and no commit or push was made from the VM.

## Diagnosis

The old manifest line is not evidence of a nightly federal attempt. Git blame dates
it to 21 September (`2aac6047f`), before the EC2 cutover. Federal interests were absent
from both daily and weekly scripts. Weekly contained only QLD and the interests export.

Measured from the AWS Sydney IP with **OPAX research (opax.com.au)**:

| Source | HTTP | Bytes | Result |
|---|---:|---:|---|
| House register index, www.aph.gov.au | 403 | 411 | WAF document |
| Senate register index, www.aph.gov.au | 403 | 411 | WAF document |
| Senate Colbeck page `/00AOL`, www.aph.gov.au | 403 | 411 | WAF document |
| Abdo static.aph.gov.au PDF | 200 | 532,927 | PDF signature present |
| Abdo public statement API PDF | 200 | 532,952 | PDF signature present |
| QLD combined register PDF | 200 | 544,615 | PDF signature present |

The direct federal fetch commands therefore cannot parse the blocked indexes/Senate
pages. Firecrawl also exposed a second House failure: the current index uses
`table.members-interests__table` and **147 public statement API links plus four static
PDFs**. The old `table.documents`/`.pdf`-only parser extracted **zero** from the real
151-member index. Missing native Tesseract was a further VM parsing limitation:
Albanese and Gosling scans yielded no usable rows until it was installed.

QLD's separate direct path works. The 29 September cutover rehearsal loaded **93
documents / 2,454 rows**, cover dated 25 September. This rehearsal fetched the cover
dated **2 October**, **93 / 2,468**. The first scheduled Sunday after cutover is 4
October. The live interests index still byte-matched the committed 4 September
index: HTTP 200, 24,755 bytes, 317 people / 10,052 served rows.

## Candidate and cadence

`conduct_interests_federal refresh` shares a maximum **100-credit** reservation budget
between chambers. It fetches fresh indexes and changed Senate pages through Firecrawl
v2, basic proxy, raw HTML, wait 3 seconds. An incomplete Senate render gets at most
one 6-second-wait retry within that budget. House PDFs use the honest research UA;
the Firecrawl fallback requests **rawBase64 alone**, with PDF parsers disabled, so
the existing geometric parser receives the original bytes. The fallback was live
verified against Abdo: **532,952 bytes, one credit**.

Caches follow source revisions/dates and recheck date-only revisions after the source
day closes. Existing House IDs survive API migration and preferred-name/spelling
corrections. No surname-only match was introduced. Unavailable documents, zero-row
parses and older House index dates preserve stored disclosures. Exit 3 is STALE;
the exporter still runs. A safe receipt updates the manifest's federal limitation
even when the KB count is unchanged. Missing key, HTTP 402, rate limiting, transport
failure and partial responses have offline tests. No source is sent to the KB.

**Daily federal, weekly QLD** is implemented in the refresh scripts and documented
with the interests data group. Current indexes show **34 House / 16 Senate** updates
after 4 September on **15 / 12 distinct days**. Latest Senate update dates represent
3–6 changed statements per week; QLD's cover advances weekly. Daily detects changes
within one nightly cycle. A quiet cached federal run costs **two credits**; a cold
76-senator run has a **78-credit base**, before retries/PDF fallback. For the observed
29-day window, two-index polling plus 16 changed Senate pages is at least **74 daily
versus 24 weekly credits** (four weekly polls). Settling checks, repeated alterations,
unavailable pages and initial cache filling add cost; these are latest-date estimates,
not a complete revision history. The final rehearsal used **six** credits: two indexes
and four previously unavailable Senate pages, all of which succeeded this time.

The key was transferred through encrypted SSH stdin into existing `~/opax/.env`,
verified **600**, without echoing it or placing it in argv/history/git. The nightly
already sources this file. Native **tesseract-ocr 5.3.4** is installed and bootstrap
now includes it. Scanned alterations remain warned/unparsed; OCR rows stay flagged.

Account reconciliation recorded a **101-credit debit during this work**.
Saved run receipts sum to 89 used credits; the remaining 12 were not individually
reconciled across diagnostics, failed and superseded attempts. The account delta is
the conservative reported total. The final run reserved/used 6 of 100, with zero
unknown charges. No further paid calls were made for comparison or final validation.

## Rehearsal comparison

The final scratch database has **320 documents / 10,395 raw rows**. It freshly parsed
**149 House documents / 5,871 rows and all 76 Senate documents / 1,980 rows**; two
House documents retained their baseline rows. QLD parsed 93 / 2,468. Export succeeded
and the existing nightly interests validator passed against HEAD, checking all 323
JSON files. Production interests tables and ingest log were unchanged by the rehearsal.

| Published 4 September → rehearsal | People | Served rows (nil cells excluded) |
|---|---:|---:|
| House | 151 → 151 | 5,720 → 5,911 |
| Senate | 73 → 76 | 1,863 → 1,980 |
| QLD | 93 → 93 | 2,469 → 2,468 |
| Total | **317 → 320** | **10,052 → 10,359 (+307)** |

New statements: **Vanessa Bleyer (16 rows), Chris Gatenby (44), Tyron Whitten (25)**.
Whitten's page now works; the September snapshot lacked it.

For full federal row comparison the VM's House baseline parsed 2 September and Senate
baseline parsed 4 September match the published totals before nil removal. Multiset
fingerprints use whitespace-normalised holder, category, kind, description and declared
date, excluding IDs, URL migration, page movement and OCR flags. **58 existing House
and 13 existing Senate statements** have changed row content. House has **209 newly
observed / 19 no-longer-parsed rows**, Senate **117 / 0**, net **+307 raw federal rows**.
Of the newly observed rows, **91 House / 31 Senate** have declaration dates after 4
September. Other differences include historical text/OCR corrections; they are not
all new declarations. Page/field-only changes would inflate the House difference to
407/217, which is why those metadata fields are excluded.

QLD's published six-items-per-bucket cap prevents reconstructing its full 4 September
row multiset. **Eleven people** have changed served buckets: Stoker, O'Shea, Head,
Last, Purdie, Frecklington, Vorster, Poole, Langbroek, Scanlon and Boyd. There are no
new QLD statements, and the exact full-count net is **−1 row** since the published
snapshot. Against the available uncapped **25 September** VM baseline, six statements
changed with **21 newly observed / 7 absent rows**, net +14. Those latter additions
and absences must not be presented as an exact 4 September comparison.

The two deliberately preserved House statements are **Ted O'Brien** (index
2025-12-28 < stored 2026-01-08) and **Anne Stanley** (2025-07-23 < 2025-07-24).
Their current cached PDFs have no post-4-September declaration dates. The final receipt
explicitly reports these older-date holds, rather than "no usable records".

Reloading all 225 federal JSONL documents stored **zero** documents/rows. A fresh
export was byte-identical after removing two obsolete baseline name-slug objects
(`n-alison-brynes.json`, `n-david-farley.json`). The exporter now performs that scoped
cleanup automatically. The pre-existing Robert Katter name collision is still logged:
the House ID wins the name alias, and QLD's separate person object remains accessible
by ID. No changes to that site-wide name-resolution policy were made here.

## Five source checks

Every check used the saved original PDF text/tables or raw HTML, independently of the
export. PDF page references are physical PDF pages; alteration dates were checked on
the following submission page where needed.

1. **Anne Aly**: self, Gifts, addition, **9 September**, PDF p8 (submission p9): ten
   Perth Ashes tickets from Westpac, donated to Ballajura Landsdale Cricket Club,
   value $1,900. Holder, section, kind, description, date and page match.
   [Source PDF](https://interests-register-api-public.aph.gov.au/api/members/13050/statement/48#page=8).
2. **Thomas French**: **spouse**, Gifts, addition, **24 September**, p22 (submission
   p23): Women in Mining WA Summit ticket sponsored by Hamilton Locke. The spouse
   cell and retained French document ID are correct despite Tom → Thomas on the index.
   [Source PDF](https://interests-register-api-public.aph.gov.au/api/members/316550/statement/48#page=22).
3. **Tim Ayres**: section 12 sponsored travel/hospitality, addition, **14 September**:
   two Midwinter Ball tickets courtesy of Fortescue. Raw HTML alteration date and
   text match; holder remains unspecified because the source does not assign one.
   [Source HTML](https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Senators_Interests/Senators_Interests_Register/16913).
4. **Richard Dowling**: section 12, addition, **29 September**: Taiwan flights,
   accommodation and hospitality for 20–27 September from Taipei Economic & Cultural
   Office. The declaration date is distinct from the travel dates, matching HTML.
   [Source HTML](https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Senators_Interests/Senators_Interests_Register/55842).
5. **Janelle Poole**: QLD gift clause 7(5)(i), PDF p94: two Chairman's Lounge tickets
   for Australia–Brazil football on **25 September**, provided by Tourism and Events
   Queensland. Newly present fifth gift vs four in the published snapshot. The register
   date is 2 October; the event date is not represented as an individual lodgement date.
   [Source PDF](https://documents.parliament.qld.gov.au/Assembly/Procedures/MembersRegister.pdf#page=94).

Marielle Smith remains person **10953**, Matt O'Sullivan **10958**, verified in the
scratch database. Offline tests exercise first-name agreement ahead of dirty tenure
flags, the new/legacy indexes, raw PDF fallback, credit/error paths, cache invalidation,
stable document/row IDs, partial render retry and scan warnings. Fixtures retain source
provenance; tests make no network requests.

## Validation and handoff

After rebasing onto current main: **759 Python tests / 220 subtests passed**, with no
exclusions, plus **189 shell checks** in an isolated Docker sandbox with fake remotes.
The full Python command was `python -m pytest -q tests parli/tests scripts/test_*.py
scripts/vm/test_*.py`. The recorded-fixture tests make no network requests.

Final VM state: **stopped**, both `~/.config/opax/hold` and `skip-nightly` removed and
absence checked before stop, nightly service **enabled**, `.env` **600**. Maintenance
stop leaves the previous service activation marked failed; the next boot starts the
enabled unit normally. The maintenance helper's boot race performed the normal checkout
pull to **85d231b864dcc55dac78bdc819362db466677b3a** before stopping the unit. No interests
tables changed, and no VM commit/push/deployment was performed by this work.

Schedules were read only:

- `opax-refresh-start`: **ENABLED**, `cron(15 3 * * ? *)`, **Australia/Sydney**, targets
  only the above instance; LastModificationDate **2026-09-29T02:30:00.060+10:00**, unchanged.
- `opax-refresh-stop-backstop`: **DISABLED**, `cron(30 10 * * ? *)`, same timezone and
  instance, LastModificationDate **2026-09-29T04:32:21.449+10:00**; left untouched.

The next start is **Sunday 4 October, 03:15 Sydney (AEDT)**. The orchestrator must review
and merge the candidate to main before that start, then confirm the nightly's
`interests_federal`/`x_interests` and Sunday's `interests_qld` logs, receipt, deployed
interests index and current manifest limitation. The secret and OCR dependency are
already installed. Scratch cache/data/status were **not promoted** into production;
the first automatic run may fill the cache at the documented cold cost, within cap.
Do not copy the scratch database into production. No scheduler change or manual full
nightly is required. Deployment and next-nightly confirmation remain the orchestrator's work.

## Review round 1 (offline)

The candidate was rebased onto `origin/main` **86d6cb92**. No EC2 or Firecrawl request
was made during this round. The original rehearsal outcomes above are historical;
the candidate now records the two older-date holds separately, so those holds alone
return success and clear the incomplete manifest line.

The fallback requires the same complete surname and reserves every exact-match ID
before considering preferred names, in either index order. Recorded Farrer-shaped
tests cover two same-seat, same-first-name members. A narrowly verified legacy metadata
correction keeps the recorded Alison Brynes/Byrnes typo from creating a duplicate;
it requires the original document ID, misspelt name, Cunningham seat and Byrnes PDF
filename, and does not relax the surname fallback.

The interests step has a 45-minute timeout; manual chamber/dry-run/fetch-only runs do
not write the production receipt by default. ID-retention database errors preserve the
House chamber unless the interests table is absent. Date-only revisions settle using
Sydney time, including the DST transition. The public account balance is removed
from the candidate's unpublished history; the **101-credit debit** above is retained.

Round-1 gates: **769 Python tests / 238 subtests passed** with outbound sockets blocked
and `FIRECRAWL_API_KEY` unset; **191 shell checks passed** in Ubuntu 24.04 Docker;
`bash -n` passed for the changed daily/test scripts and the weekly/nightly/data-group/
bootstrap scripts. The recorded complete index retains **151 distinct legacy House IDs**.
