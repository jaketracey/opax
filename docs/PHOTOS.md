# Portraits: sources, licences, matching, refresh

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

## Why not the APH image API directly

`www.aph.gov.au/api/parliamentarian/<MPID>/image` returns 403 to every identified
User-Agent (research UA, curl, python-requests, a self-identifying bot UA) and 200 only to a
request with no User-Agent at all. Sending none is not spoofing but it is evading an anti-bot
rule, so the federal set was taken from OpenAustralia instead: the same official portraits,
keyed by the same person ids, served to our honest UA, `/images` not disallowed by their
robots.txt. Every one of the 401 requested ids was there.

## Scripts (`scripts/`)

1. `backfill_photos_oa.py` — every roster entry with a numeric `pid` and no file: fetch from
   OpenAustralia (large, then small), centre-square crop nudged up 10 %, write webp, map the name.
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

## JPEG twins for share images

`public/photos/jpg/<id>.jpg` is a JPEG copy of every portrait, written by
`npm run og:portraits` in `portal/` (sharp, quality 86). The Worker reads them
to draw the Open Graph card for a person or a speech (`docs/SEO.md`, "Share
images"), because satori, which lays the card out, cannot decode WebP. Re-run
the script after any portrait lands or changes; it skips files already newer
than their source. The site itself still serves the WebP.
