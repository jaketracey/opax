# Portraits: sources, licences, matching, refresh

Status 2026-09-04: **829 portraits** serve 1,025 of the 1,557 people in `parliamentarians.json`
(66 %; 259 of the 313 sitting-member name entries). Before this pass there were 201 files
covering 197 people. Files live in `portal/public/photos/<key>.webp` (200×200, quality 82);
`photos/people.json` maps every lowercased display name to a key; `photos/credits.json`
carries the attribution for the Commons set. `app.js` resolves a name through `people.json`
(`photoUrlFor`) and, for `wd-` keys, appends a "Photo" row to the person infobox
(`renderPortraitCredit`).

| Key | Source | Count | Licence | Who |
|---|---|---:|---|---|
| `<person_id>` (numeric) | APH official portraits, fetched from OpenAustralia (`/images/mpsL/<id>.jpg`, same id space as `members.person_id`); the original 201 came from the APH image API | 551 | Parliament of Australia website, CC BY-NC-ND 4.0 (site-wide) | federal members and senators since 2006 |
| `wd-<QID>` | Wikimedia Commons file named by Wikidata P18 on the person matched to the seat | 277 | per file — CC BY-SA 4.0 (118), CC BY 4.0 (37), CC BY 2.0/3.0, CC BY-SA 2.5/3.0 AU, CC0 (14), public domain (10), GFDL (2), "copyrighted free use" (2) | state parliamentarians (NSW, VIC, QLD, SA) and pre-2006 federal members |

Coverage by jurisdiction (people with a portrait / people on the roster): federal 724 / 872,
NSW 106 / 240, VIC 103 / 234, SA 63 / 104, QLD 29 / 107. Queensland is low because most QLD
Hansard names are surname-only, and surname-only matches are held to a stricter test (below).

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
2. `wikidata_match.py` — roster entries without a numeric pid: SPARQL for holders of the matching
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
4. `fetch_commons_portraits.py` — Commons API `imageinfo|extmetadata` for licence, artist,
   credit and file page (50 titles a call); download; write `credits.json`. Two files
   under the bare "Attribution" template were skipped.
5. `recrop_commons_portraits.py` — the sources are re-fetched at 640 px into
   `scripts/_photos_work/src/`; YuNet (`face_detection_yunet_2023mar.onnx`, OpenCV 5) finds
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
* State: `wikidata_match.py` → re-apply the drop rules → `fetch_commons_portraits.py` →
  `recrop_commons_portraits.py`, then look at the sheets. Never ship a Commons batch unseen.
