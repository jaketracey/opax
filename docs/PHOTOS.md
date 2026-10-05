# Portraits: sources, licences, matching, refresh

Status 2026-10-06: 849 portrait files (850 with the placeholder); `people.json` maps 964 names to
830 of them, which gives 965 of the 1,700 people in `parliamentarians.json` a face (245 of the 328
entries the roster marks sitting; every sitting member who had a face still has one). The identity
work of that day (below) took names off faces that were not theirs, gave the roster verified person
ids, and stopped records joining on portrait keys; both deploy scripts run the identity check.

Status 2026-09-12: **850 portraits** serve 1,066 of the 1,557 people in `parliamentarians.json`
(68 %; 280 of the 313 sitting-member name entries). The 2026-09-04 pass had 829 files for
1,025 people (259 sitting entries); before that there were 201 files covering 197 people. Files live in `portal/public/photos/<key>.webp` (200×200, quality 82);
`photos/people.json` maps every lowercased display name to a key; `photos/credits.json`
carries the attribution for the Commons set. `app.js` resolves a name through `people.json`
(`photoUrlFor`) and, for `wd-` keys, appends a "Photo" row to the person infobox
(`renderPortraitCredit`).

| Key | Source | Count | Licence | Who |
|---|---|---:|---|---|
| `<person_id>` (numeric) | APH official portraits, fetched from OpenAustralia (`/images/mpsL/<id>.jpg`, same id space as `members.person_id`); the original 201 came from the APH image API | 551 | Parliament of Australia website, CC BY-NC-ND 4.0 (site-wide) | federal members and senators since 2006 |
| `wd-<QID>` | Wikimedia Commons file named by Wikidata P18 on the person matched to the seat | 299 | per file — CC BY-SA 4.0 (129), CC BY 4.0 (43), CC BY 2.0/3.0, CC BY-SA 2.5/3.0 AU, CC0 (18), public domain (11), GFDL (2), "copyrighted free use" (2) | state parliamentarians (NSW, VIC, QLD, SA), pre-2006 federal members, and 2025-intake federal members OpenAustralia cannot serve (below) |

Coverage by jurisdiction (people with a portrait / people on the roster, a person counted under
each jurisdiction they sat in): federal 755 / 946, NSW 133 / 288, VIC 109 / 245, SA 64 / 108,
QLD 33 / 121. Queensland is low because most QLD Hansard names are surname-only, and
surname-only matches are held to a stricter test (below).

### 2026-09-12 pass (+21 files, +41 people, sitting entries 259 → 280)

* **OpenAustralia is now behind a Cloudflare managed challenge** (`cf-mitigated: challenge`,
  403 to our research UA on every path including the homepage and `/images/mpsL/<id>.jpg`).
  ParlInfo's handbook image path (`/parlInfo/download/handbook/allmps/<APH id>/upload_ref_binary/`)
  403s an identified UA too, like the APH image API. So the 33 sitting members still without a
  portrait are almost all the 2025 intake with a numeric pid and no Commons photo
  (Kara Cook, Claire Clutterham, Julie-Ann Campbell, Mary Aldred, Jessica Collins, Cameron
  Caldwell, Alison Penfold, Gabriel Ng, Renee Coffey, Simon Kennedy, Tom Venning, David Batt,
  Trish Cook, Zhi Soon, Ben Small, Carol Berry, Jamie Chaffey, Tom French, Emma Comer,
  Sean Bell, David Moncrieff, Rowan Holzberger, Matt Gregg, Ash Ambihaipahar, Jess Teesdale,
  David Farley, Matt Smith, Alice Jordan-Baird, Madonna Jarrett) plus four surname-only
  committee entries that span a state chamber ("Walsh", "Walker", "Ng", "Wilson"). Re-run
  `backfill_photos_oa.py` when OpenAustralia answers again; nothing else is needed.
* 16 sitting or former federal names had an official portrait on disk under their pid but no
  `people.json` line (the roster name changed after the file landed, or the entry is a
  surname-only committee name whose chambers are all federal): mapped to the existing file,
  e.g. "Lambie" → 10830, "Tyrrell" → 11012, Lisa Darmanin → 11021. Surname-only entries that
  span a state chamber were left alone. "Burke" moved from 10080 (Anna) to 10081 (Tony), which is
  the pid the roster assigns it.
* `wikidata_match.py` now also takes people **with** a numeric pid but no file, matching them
  against House and Senate holders (a `senate_committee` chamber counts as both). An official
  portrait wins over Commons when both exist for a pid. 38 new matches; one licence skip
  (Hugh McDermott, bare "Attribution" template), one group shot dropped by YuNet (Susan Carter),
  one wrong person dropped by eye: "T Smith" (VIC LA + a federal committee) matched Tony Smith
  of Casey through the federal side while the speeches are Tim Smith of Kew. Initials-only names
  now get the same one-parliament rule as surname-only names. Net 21 new Commons files; sheets
  `scripts/_photos_work/recrop_sheet_new_1.png` and `pid_remap_sheet.png`.
* The electorate reference data (`portal/public/electorates/`) was not needed: no match was
  ambiguous, so a dated seat-holder key had nothing to disambiguate. The limit is Wikidata
  having no P18 for the person, not matching.
* Official state parliament portrait pages, checked 2026-09-12 and **all skipped**:
  NSW (`parliament.nsw.gov.au/copyright`) permits copying with the © State of NSW notice but
  requires permission to *modify* the material, and a face crop is a modification; its image
  library (`images.parliament.nsw.gov.au/pages/Conditions`) excludes "photographs of people"
  from its CC BY-NC-ND licence outright. VIC (`parliament.vic.gov.au/copyright`) allows only
  personal, non-commercial, research or in-organisation use, otherwise permission from the
  Presiding Officers. QLD (`parliament.qld.gov.au/global/copyright`) excludes "Queensland
  Parliament materials", graphics included, from its CC BY-NC-ND text licence and requires the
  Clerk's written consent. SA has no copyright or licence statement anywhere on
  `parliament.sa.gov.au` (footer, members pages, search), so nothing permits reuse. WA's site
  states "use without permission is prohibited"; TAS, NT and ACT publish no reuse licence, and
  the roster has no people from those four parliaments anyway.

## Identity check (2026-10-06)

A review of the map for the iOS app found pairs of different people on one key, and the Codex
review of the first fix found the same wrong ids under the records: the person page and the
directory took votes, expenses and interests by the photo key or the roster pid, and the pay build
named its records through the roster. "Patrick Conaghan" showed Rex Patrick's face, 1,598 divisions
and expenses; Graeme Campbell had George Campbell's 381 divisions and pay; David Cox, Ian McLachlan
and Bill Taylor were marked sitting through Dorinda Cox's, Andrew McLachlan's and Angus Taylor's
ids.

**Cause.** The roster's `pid` was the dominant `person_id` on a name's speeches
(`export_parliamentarians.py`), and the speech linker gives some prints the id of a namesake (for
members who left by 2004, a later one with the same surname) or of a member whose surname is their
first name (Patrick → Rex Patrick, Alexander → John Alexander, Robert → Stuart Robert). Everything
keyed on it inherited the error: `backfill_photos_oa.py` mapped every roster name to its roster pid
(two names on one pid both landed in the same run), `build_pay.py` named a Handbook record after
the roster row with the most speeches for its pid ("David Cox" on Dorinda Cox's pay), and `app.js`
read records by photo key. Four wrong files came from the old stack's surname fetch and one from
OpenAustralia itself.

**The roster's pid is verified.** `scripts/roster_identity.py` decides it for
`export_parliamentarians.py` from the members table: a print keeps an id only when
`scripts/person_identity.json` lists it (`same_person`, checked by hand), or one of its own speech
ids belongs to a member whose name agrees, or (a full name) exactly one federal member agrees by
name and sat in its years. `current`, `party_now` and `full` follow the verified id. A surname or
initials print takes an id only when it is one person: federal only, no committee-witness rows, no
other member's id on its speeches, every year inside the member's term, no chamber the member never
sat in. Otherwise it gets none: "Cox" holds David Cox's Kingston years and Dorinda Cox's,
"McKenzie" holds witnesses named McKenzie. The database was out of reach (desktop down, the refresh
VM off outside its window), so `python3 scripts/roster_identity.py --pinned` applied the same rule
to the shipped `parliamentarians.json` from the repository's exports (TheyVoteForYou names, pay
records whose name agrees, electorate seat periods); 118 rows changed, only in `pid`, `current`,
`party_now` and `full`, and a second run changes nothing. The weekly `x_people` export now produces
the same from the database.

| Print | Was | Now | Evidence |
|---|---|---|---|
| Graeme Campbell | 10098 (George Campbell) | none | Kalgoorlie, left 1998; OpenAustralia 10099, not in the members table |
| Kathy Sullivan, Kathryn Sullivan | 10615 (Jon Sullivan) | none | Moncrieff, left 2001 (OA 10616) |
| Ricky Johnston | 10344 (David Johnston) | none | Canning, left 1998 (OA 10346) |
| Bill Taylor | 10817 (Angus Taylor), sitting | none | Groom, left 1998 (OA 10623, William Leonard Taylor) |
| Michael Cobb | 10127 (John Cobb) | none | Parkes, left 1998 (OA 10128) |
| Ian McLachlan | 10959 (Andrew McLachlan), sitting | none | Barker, left 1998 (OA 10441) |
| David Cox | 10964 (Dorinda Cox), sitting | none | Kingston, left 2004 (OA 10155) |
| Stephen Martin | 10905 (Steve Martin) | none | Cunningham, the former Speaker, left 2002 (OA 10420) |
| Patrick Conaghan | 10903 (Rex Patrick) | 10922 | Pat Conaghan; OA lists Patrick John Conaghan |
| Patrick Farmer | 10903 (Rex Patrick) | 10212 | Pat Farmer; OA lists Patrick Francis Farmer |
| Alexander Somlyay | 10725 (John Alexander) | 10600 | Alex Somlyay; OA lists Alexander Michael Somlyay |
| Robert Baldwin | 10545 (Stuart Robert) | 10026 | Bob Baldwin; OA lists Robert Charles Baldwin |

Eleven full names gained their own id (David Shoebridge, Janelle Saffin, Chris Crewther, Mehreen
Faruqi, Gregory Hunt and the curly-apostrophe twins such as "Brendan O’Connor"), and 94 surname
prints lost theirs as mixed. The OA ids of the 1990s members are not given: the members table holds
TheyVoteForYou's members (2006 on), so the export cannot verify them, and nothing is keyed on them.

**Records join on identity, never on a portrait.** The person page passes the roster pid to
`renderPersonVotes`, `renderPersonInterests` and `renderPersonExpenses`; the directory and
`votesFor` take the roster pid and each export's own name index (`votes.json` `_names`, IPEA
`names`, the interests `_by_name`). `photoMap` is read only by `photoIdFor`
(`portal/test/person-identity.test.mjs` checks the six names and that). `build_pay.py` names a
record after the roster row matching the Handbook's best public name (else most speeches) and
indexes every roster spelling of the pid. The shipped `pay.json` was patched by running the build
from the cached Handbook with the old and the corrected roster and carrying only the identity
differences across (18 records' name/pid/party, the current list's names, the name index): George
Campbell's record is his again, Rex Patrick's is no longer "Patrick Conaghan", David Cox and the
former Speaker Stephen Martin get their own records back without another member's id.

**Faces.** Removed in the first fix (27): the 13 full names above from the wrong keys; five names
whose own file shows someone else (`wrong_face`: Anna Burke 10080 = Tony Burke's 10081, Bruce Scott
10565 = Scott Buchholz's 10752, John Alexander 10725 = Sandy Macdonald's Senate portrait 10402, his
given names being John Alexander; Marise Payne 10509, a woman with long curly hair, probably Alicia
Payne; Roger Price 10519, a woman, probably Melissa Price), settled by the backdrop (340 of 342
House-only portraits are green, all 176 Senate-only ones red) and reference photos viewed for
identification only; and nine surname prints the roster gave to someone else or no one. Removed in
the second (77): every surname print that spans more than one parliament (27) or includes
committee-witness rows (50), from "Abbott" to "Wong". Twelve state members had only such a print
and lost their only face: Andrew, Angus, Bailey, Bates, Bolton, Dalton, Dick, Foley, Krause,
Morris, Nicholls, Nightingale (their Queensland, Victorian or NSW rows share the print with
federal-committee witnesses). Restored on the verified ids: Patrick Conaghan (10922), Alexander
Somlyay (10600), Robert Baldwin (10026). Every sitting member who had a face still has one.

**The check.** `scripts/photo_identity.mjs` audits the map. Corrupt, which fails: a name that does
not agree with its key's owner (TheyVoteForYou name, else `pay.json`; the Wikidata label for a
`wd-` key) unless `same_person` lists it, a name on a `wrong_face` file, a key with no file, two
keys with identical bytes. Roster, which warns: a surname print that spans parliaments, includes
witnesses or lacks that pid in the roster; a full name the roster gives another pid; a key holding
names with different roster pids; an unknown owner. Both `npm run deploy` and `npm run
deploy:staging` run `photo_identity.mjs --deploy` before Wrangler: it stops on a corrupt mapping
and otherwise ships the map without the roster warnings' names (the working copy of `people.json`
is left changed, as the other builds leave theirs). `portal/test/photo-identity.test.mjs` (in the
Actions deploy before `npm run deploy`) fails on corrupt and prints the warnings, so a weekly
roster change cannot block a nightly data deploy. The photo scripts end with `--strict`, which
fails on either. `backfill_photos_oa.py` maps a name only when it agrees with the pid's owner (or
is listed), never onto a `wrong_face` file, a surname print only alongside a fetch and only when
its row is one person, and discards a download whose bytes match another portrait. The quiz takes
faces from `people.json`; a person with no face gets the blank circle in the directory too.

**Caches.** `OG_VERSION` is 6, which changes every share-card URL and the Worker's card cache key,
so no cached card keeps a removed face. The files that say who is who are `photos/people.json`,
`parliamentarians.json`, `pay.json`, `votes.json`, `expenses.json` and `interests/index.json`
(whose face, which pid and seat, and each record set's name index). Every page module fetches them
with `cache: "no-cache"`, and `_headers` serves them `max-age=0, must-revalidate`. A browser that
kept last release's copy under the old one-hour-plus-a-day headers ignores new headers until it
asks again, so the fetch option is what retires it: the browser revalidates (an ETag round trip, a
304 with no body when nothing changed) and takes the corrected file on the next page load. The
bills already work this way. A loader is only as fresh as the copy of its module the browser runs,
so the three modules that fetch these files themselves (`quiz.js` and `timemachine.js`, imported by
`app.js`, and `home-data.js`, imported by `home.js`) are imported by a URL carrying their content
hash: `scripts/stamp_assets.mjs` writes it (`MODULE_STAMPS`) before it hashes the importer,
`--check` fails when it is stale, and the test fails on an unversioned or stale import, or on a new
module that fetches an identity file without being listed. Every other module takes faces and
records from `app.js`, which is itself stamped. Checked with `wrangler dev` and a headless Chrome
profile primed on `/explore?game=quiz` by the release before this branch (the old `/quiz.js`, faces
by roster pid: Rex Patrick's 10903 on Patrick Conaghan, Dorinda Cox's on Cox): this branch's shell
fetched `/quiz.js?v=<hash>` from the network and its portrait map gave Pat Conaghan's 10922 and no
face for Cox, while round 2's shell, importing the bare `/quiz.js`, ran the cached old module from
disk and kept Rex Patrick's face (`scripts/_photos_work/qa-portrait-pairs-r3/`).
`portal/test/identity-cache.test.mjs` runs the loaders against a recording `fetch`, scans every
module's fetches of these paths and checks the header rules; checked with `wrangler dev` and a
headless Chrome profile primed by the release before this branch (Rex Patrick's face and 1,598
divisions on Patrick Conaghan, then served from disk): the next load took every identity file from
the network and showed Pat Conaghan's face and 1,199 divisions, no face or votes on Graeme Campbell
and Cox; the same profile with round 1's loaders kept serving the old files from disk
(`scripts/_photos_work/qa-portrait-pairs-r2/`). Answers cached under `CACHE_EPOCH` (a pay ranking
naming "Ian McLachlan") stay until the epoch next moves, which the nightly does only when the
knowledge box changes; bump it with `scripts/bump_cache_epoch.py` at deploy if that matters.

**Nightly safety net.** The roster export runs against the real database only in the weekly group
(Sundays, step `x_people`), and the corrected roster above came from the pinned exports, so
`export_parliamentarians.py` refuses to ship a roster that moves too far from the one the site
ships now. `refusals(previous, new)` holds the export if any sitting member's row loses its pid,
changes it, loses its sitting status or disappears; if more than 25 rows change `pid`, `current`,
`party_now` or `full`; or if the row count drops. It fails closed: a baseline that is missing,
unreadable, not JSON, or without a non-empty `people` list of named rows is a reason to hold too,
never permission to ship (a missing or malformed baseline once let a roster with no sitting ids
through the real wrappers). A held export prints `ROSTER HELD: <reasons>` to stderr and exits 3
with nothing on stdout, so `scripts/vm/export_step.sh` keeps the shipped `parliamentarians.json`;
`weekly_refresh.sh` lists `x_people` in `STALE_OK` (logged STALE, not a failure) and logs a `Roster
held:` line, which `nightly.sh` turns into a status warning: "the roster export was held and the
shipped parliamentarians.json kept (review, then OPAX_ROSTER_ACCEPT=1): <reasons>". An election, a
retirement, a deliberate first export with no baseline, or the first real-database run after this
change can trip it legitimately: review the difference, then rerun on the VM with
`OPAX_ROSTER_ACCEPT=1 OPAX_ONLY=x_people scripts/weekly_refresh.sh weekly`. Tests:
`scripts/test_export_parliamentarians.py` (each rule, every kind of unusable baseline, and an
export whose members table knows nobody, held and shipped only with the override),
`scripts/test_roster_export_wrappers.py` (the same through the real `export_step.sh` and
`export_people.sh` with the production SQL: a good, missing, malformed or null-people baseline
holds and keeps the file byte for byte; the override installs) and `scripts/vm/test_nightly.sh` (a
held export is STALE with a `Roster held:` line; the night stays ok with the reason in its
warnings).

**Left open.** The five `wrong_face` files (and their JPEG twins and entries) should be deleted so
a refresh can fetch the real portraits; 10725 will come back as Sandy Macdonald's from
OpenAustralia, so John Alexander needs Commons. Rex Patrick's 10903 and Steve Martin's 10905 are
their own faces but no roster name uses them.

**Follow-up: state faces through dated, chamber-scoped person rows.** The twelve state members who
lost their only face (Stephen Andrew, Neil Angus, Mark Bailey, Ros Bates, Sandy Bolton, Nigel
Dalton, Cameron Dick, Martin Foley, Jon Krause, David Morris, Tim Nicholls, Margie Nightingale)
have no row of their own: Hansard prints them by surname, and their surname row also holds
federal-committee witnesses (Dalton spans QLD and NSW, Morris ACT, VIC and federal). The fix is in
the data model, not the map: the export should split a surname row by dated jurisdiction, chamber
and seat evidence into an owner row (Mark Bailey: the QLD Legislative Assembly rows for his seat
and years) that can carry the face and the records, leaving the aggregate print blank. The same
split should take David Cox's Kingston representation off the "Cox" row, where
`enrich_profile_jurisdictions.py` puts it by name; a surname page should not imply that one seat
identifies the whole row.

## Why not the APH image API directly

`www.aph.gov.au/api/parliamentarian/<MPID>/image` returns 403 to every identified
User-Agent (research UA, curl, python-requests, a self-identifying bot UA) and 200 only to a
request with no User-Agent at all. Sending none is not spoofing but it is evading an anti-bot
rule, so the federal set was taken from OpenAustralia instead: the same official portraits,
keyed by the same person ids, served to our honest UA, `/images` not disallowed by their
robots.txt. Every one of the 401 requested ids was there.

## Scripts (`scripts/`)

1. `backfill_photos_oa.py` — every roster entry with a numeric `pid` and no file: fetch from
   OpenAustralia (large, then small), centre-square crop nudged up 10 %, write webp, map the name;
   a renamed full name whose pid has a file is mapped without a fetch. Only names that agree with
   the pid's owner are mapped (Identity check, above). The roster's pid itself is verified by
   `roster_identity.py` (the same section).
   Blocked by a Cloudflare challenge since at least 2026-09-12; retry before assuming it still is.
2. `wikidata_match.py` — roster entries without a portrait (no numeric pid, or a pid whose
   OpenAustralia fetch failed): SPARQL for holders of the matching
   seat (`P39` = member of the NSW LA/LC, VIC LA/LC, QLD LA, SA HA/LC, House, Senate) who have a
   `P18` image. Match rules: surname exact; a real first name must agree by prefix either way
   (Greg/Gregory yes, Anthony/Albert no); SA-style initials ("K.J. Maher") must agree with the
   label's initials; surname-only names take a single candidate only. Every candidate must
   have a dated term overlapping the person's speech years, or a birth year ≥ 1920 when the
   term is undated (the first pass matched a Victorian MLA who died in 1894). Output
   `scripts/_photos_work/wikidata_matches.json`.
3. Seat-holder audit (inline in the session, rules now in `wikidata_match.py`'s docstring):
   a surname-only match is dropped when the roster entry spans more than one parliament
   ("Katter" = Bob federally + Robbie in QLD; 39 such entries) or when another holder of the
   same seat shares the surname and could overlap the years (1). `scripts/_photos_work/wikidata_drop.json`.
4. `fetch_commons_portraits.py [--new]` — Commons API `imageinfo|extmetadata` for licence, artist,
   credit and file page (50 titles a call); download; write `credits.json`. Files under the bare
   "Attribution" template are skipped (three so far). Names on `wikidata_drop.json` are ignored.
5. `recrop_commons_portraits.py [--new]` — the sources are re-fetched at 640 px into
   `scripts/_photos_work/src/` (`--new` fetches them itself for this run's keys and leaves the
   older crops untouched); YuNet (`face_detection_yunet_2023mar.onnx`, OpenCV 5) finds
   faces; the crop is a square of 2.6× the largest face; a second face ≥ 60 % the size of the
   first marks a group shot and the file is dropped (15). Contact sheets
   `recrop_sheet_<n>.png` were checked by eye before shipping.

`scripts/_photos_work/` is git-ignored (sources, sheets, logs, the ONNX model).

## Licence handling

* Numeric keys: the site-wide aph.gov.au CC BY-NC-ND covers the House and Senate portraits as
  the existing 201 already did; no per-image line.
* `wd-` keys: attribution is a licence condition, so the person page shows
  "Photo: <artist>, <licence>, via Wikimedia Commons" in the infobox with links to the licence
  and the file page; `credits.json` is public. Thumbnails elsewhere (directory, slider,
  result meta) carry no line; the person page is one click away. CC BY-SA files are cropped
  and resized, which is an adaptation; the crops are offered under the same licence
  (the `credits.json` entry is the notice).

## Refresh

* Federal: re-run `backfill_photos_oa.py` after a new `parliamentarians.json`; it only fetches
  ids without a file. New members need OpenAustralia to have them (it lags a new parliament by
  weeks).
* State, and federal while OpenAustralia is unreachable: `wikidata_match.py` →
  `fetch_commons_portraits.py --new` → `recrop_commons_portraits.py --new`, then look at
  `recrop_sheet_new_<n>.png` and drop wrong people by adding the OPAX name to
  `wikidata_drop.json` and removing the file, credit and `people.json` line. Never ship a
  Commons batch unseen. Then `npm run og:portraits` in `portal/`.
* Each script ends with `node scripts/photo_identity.mjs`; a non-zero exit names the line to fix.
  A hand edit to `people.json` gets the same check from `node --test test/photo-identity.test.mjs`
  in `portal/`.

## JPEG twins for share images

`public/photos/jpg/<id>.jpg` is a JPEG copy of every portrait, written by
`npm run og:portraits` in `portal/` (sharp, quality 86). The Worker reads them
to draw the Open Graph card for a person or a speech (`docs/SEO.md`, "Share
images"), because satori, which lays the card out, cannot decode WebP. Re-run
the script after any portrait lands or changes; it skips files already newer
than their source. The site itself still serves the WebP.
