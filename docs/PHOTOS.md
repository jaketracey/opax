# Portraits: sources, licences, matching, refresh

Status 2026-10-06: 849 files; `people.json` maps 1,038 names to 842 of them, which gives 1,039
of the 1,700 people in `parliamentarians.json` a face (275 of the 385 entries the roster marks
sitting). The identity fix of that day (below) took 27 names off faces that were not theirs; every
map writer now ends with the identity check, and so does the deploy's test run.

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

A review of the map for the iOS app found pairs of different people on one key. The person page
reads more than the face through that key: `renderPersonVotes`, `renderPersonExpenses` and
`renderPersonInterests` in `app.js` take the photo key as the person's id, so "Patrick Conaghan"
showed Rex Patrick's face, voting record and expenses. 27 names were taken off the map:

* **A full name on somebody else's pid (13).** The key's owner is the TheyVoteForYou name for the
  pid in `votes.json`: Graeme Campbell on 10098 (George Campbell); Kathy and Kathryn Sullivan on
  10615 (Jon Sullivan); Ricky Johnston on 10344 (David Johnston); Patrick Conaghan and Patrick
  Farmer on 10903 (Rex Patrick); Alexander Somlyay on 10725 (John Alexander); Robert Baldwin on
  10545 (Stuart Robert); Bill Taylor on 10817 (Angus Taylor); Michael Cobb on 10127 (John Cobb);
  Ian McLachlan on 10959 (Andrew McLachlan); David Cox on 10964 (Dorinda Cox); Stephen Martin on
  10905 (Steve Martin, the Tasmanian senator, not the Speaker). The owner keeps the key.
* **A file showing somebody else (5).** Three pairs of keys held byte-identical files, and a look
  at the first 200 files (the old stack's, fetched by surname) found two more. Owners were settled
  by the backdrop (340 of 342 House-only portraits are green, all 176 Senate-only ones red) and,
  for identification only, reference photos on Wikipedia and Commons: 10080 = 10081 is Tony
  Burke (white hair, dark glasses, as in 2024), so Anna Burke lost the face; 10565 = 10752 is
  Scott Buchholz, so Bruce Scott did; 10725 = 10402 is a red Senate portrait, Sandy Macdonald's
  (his given names are John Alexander, which is how OpenAustralia came to serve it for John
  Alexander's id too), so John Alexander did; 10509 shows a woman with long curly hair, not
  Marise Payne (probably Alicia Payne, 10919); 10519 shows a woman, not Roger Price (probably
  Melissa Price, 10818). The five files stay on disk, unmapped and listed as `wrong_face`.
* **Surname prints the roster gives to someone else or to no one (9).** "Burke" (roster 10080,
  map 10081), "Price" (10818 / 10519), "Collins" (11055 / 10136), and "Garrett", "Hanson",
  "Howard", "Marshall", "Williams", "Morton", which the roster gives no pid because they span a
  state parliament (Jane Garrett, Jeremy Hanson, Steven Marshall ...).

No sitting member lost a face: the five sitting entries that did ("Collins", "Price", David Cox,
Ian McLachlan, Bill Taylor) are mixed prints or 1990s members the roster wrongly marks sitting
through the wrong pid.

**Cause.** The roster's `pid` is the dominant `person_id` on a name's speeches
(`export_parliamentarians.py`), and the speech linker gives some prints the id of a namesake (for
members who left by 2004, a later one with the same surname) or of a member whose surname is their
first name (Patrick → Rex Patrick, Alexander → John Alexander, Robert → Stuart Robert).
`backfill_photos_oa.py` mapped every roster name to its roster pid without asking whose pid it was,
and when two names shared a pid without a file, both landed in the same run. The five wrong files
came from the old stack's surname fetch and, once, from OpenAustralia itself.

**The check.** `scripts/photo_identity.mjs` audits the whole map and exits 1 on a problem;
`portal/test/photo-identity.test.mjs` runs it in every deploy, and `backfill_photos_oa.py`,
`fetch_commons_portraits.py` and `recrop_commons_portraits.py` end with it. Rules: a name agrees
with its key's owner (TheyVoteForYou name for a numeric key, else `pay.json`; the Wikidata label
in `credits.json` for a `wd-` key): same surname, a first name that is a prefix of one of the
owner's either way, initials that agree. A surname or initials print on a numeric key needs the
roster to give it that pid. A roster name with a numeric pid sits on that pid, or on a `wd-` key
whose label is the pid's owner. No key holds names the roster gives different pids; no two keys
hold identical bytes; every key has a file. `scripts/photo_identity.json` holds the verified
exceptions: `same_person` (eight prints such as "Kevin Drum" for Damian Kevin Drum and "Katrina
Allen" for Katie Allen) and `wrong_face` (the five files). `backfill_photos_oa.py` now maps a name
only when it agrees with the pid's owner (or is a `same_person` entry), never onto a `wrong_face`
file, maps a surname print only alongside a fetch and only when every chamber it spoke in is
federal, and discards a download whose bytes match another portrait. The quiz took its faces from
the roster pid (`person.pid`), bypassing the map; it reads `photos/people.json` now. A person with
no face gets the blank circle in the Parliamentarians directory too, which showed an initial.

**If a nightly deploy fails on this test,** the roster has changed whom a mapped print belongs to:
the message names the line. Remove it from `people.json` (or, once verified, add a `same_person`
entry); `skip_tests` is for emergencies only.

**Left open.** The roster pid is still wrong for the 13 full names, so the people directory sorts
them by the other person's divisions and marks David Cox, Ian McLachlan and Bill Taylor as sitting;
the fix belongs in `export_parliamentarians.py` (keep a pid only when the members-table name
agrees). Once it is fixed, "Patrick Conaghan" can take 10922, "Alexander Somlyay" 10600 and "Robert
Baldwin" 10026. The five `wrong_face` files should be deleted with their JPEG twins and their
`wrong_face` entries, so a refresh can fetch the real portraits (10725 will come back as Sandy
Macdonald's from OpenAustralia; John Alexander needs Commons). Rex Patrick's 10903 and Steve
Martin's 10905 are their own faces but no roster name uses them. Surname prints the roster ties to
the face's owner but which also hold other people's speeches ("Murphy" in the NSW Council,
"Anderson" years after John Anderson left, "Cox" for David Cox's years) keep their face: that is a
roster identity question, listed in the iOS portraits review.

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
   the pid's owner are mapped (Identity check, above).
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
