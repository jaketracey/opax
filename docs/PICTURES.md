# The year in pictures: sources, licences, curation, refresh

Status 2026-09-05: **189 photographs** cover every Time Machine year from 1998 to
2026, each year holding six to eight except 1998 and 1999. Files live in
`portal/public/years/pictures/<year>/<slug>.webp`; `portal/public/years/pictures.json`
supplies the dimensions, caption, event, date, author, Commons credit, licence,
licence URL, Commons file page and original upload URL used by the gallery.

The pictures are documentary evidence, not decoration. Each selection was checked
against `YEAR_TOPICS` in `portal/public/timemachine.js` and the cited brief in
`portal/public/years/<year>.json`, then inspected visually. Search results were not
used merely because they mentioned the right year. A first pass (recorded below)
shipped one photograph per year at minimum; a second pass, "more photographs for
the year in pictures", brought every year to six to eight by adding a second and
third strand of coverage so no year is a single-series monoculture.

| Year | Pictures | Principal coverage |
|---|---:|---|
| 1998 | 4 | The waterfront dispute and the AUSMIN talks in Sydney |
| 1999 | 4 | The INTERFET deployment to East Timor |
| 2000 | 7 | The Sydney Olympics and Paralympics, and the East Timor handover |
| 2001 | 6 | The Ansett collapse and the alliance after 11 September |
| 2002 | 7 | Australian forces in the Gulf and East Timor, and diplomatic talks abroad |
| 2003 | 7 | The Canberra bushfires, the Iraq war and the Solomon Islands mission |
| 2004 | 7 | The federal election, the Jakarta embassy bombing and Iraq |
| 2005 | 7 | WorkChoices protests, student unionism and the tsunami response |
| 2006 | 7 | Labor's leadership change, Anzac Day, anti-terror laws, Cyclone Larry and Beaconsfield |
| 2007 | 7 | The federal election and APEC in Sydney |
| 2008 | 6 | The Apology to the Stolen Generations and the alliance |
| 2009 | 7 | Emissions trading, Black Saturday and the stimulus |
| 2010 | 7 | The federal election, Labor's leadership change and the alliance |
| 2011 | 7 | The Queensland floods, the carbon price and the alliance |
| 2012 | 7 | The NDIS campaign, the tent embassy protest and the alliance |
| 2013 | 7 | Leadership change, the federal election and regional diplomacy |
| 2014 | 7 | The budget fight, the Brisbane G20 and the China trade deal |
| 2015 | 7 | Citizenship, the China trade deal, leadership change and refugee policy |
| 2016 | 7 | The federal election, the double dissolution and offshore processing |
| 2017 | 7 | The marriage equality postal survey, energy prices and the Adani mine |
| 2018 | 6 | The Wentworth by-election, the school strike for climate and the Pacific step-up |
| 2019 | 6 | The Sydney climate strike, the federal election and the Black Summer bushfires |
| 2020 | 6 | COVID-19 border restrictions, the Black Summer bushfires and the Black Lives Matter rally |
| 2021 | 8 | March 4 Justice, the vaccine rollout, the WA election and AUKUS |
| 2022 | 6 | The federal election, the 2022 floods and the State of the Environment report |
| 2023 | 6 | The Voice referendum and the alliance |
| 2024 | 6 | Diplomatic visits, the Quad and health workers' pay |
| 2025 | 6 | The federal election and the Washington visit |
| 2026 | 7 | The EU and Japan agreements, Labor's national conference and the SA state election |

The years short of six are **1998 and 1999**, each still at four. They are
deliberately short: exhaustive Commons searches and category traversal (recorded
under "Second pass" below) turned up only maps, election posters, unrelated stock
and out-of-year frames for every other 1998 and 1999 event named in `YEAR_TOPICS`
(the GST, native title, Telstra's sale, the republic referendum, aged care); no
compliant photograph of any of them was found. Nothing was added to reach a quota.

## Source and licence rule

All 189 shipped source pages are on Wikimedia Commons. No news-agency, commercial
stock, social-media, generated or screenshot image is present. Government and
Parliament pages were not needed for the final set, and no APH image carrying a
non-commercial or no-derivatives restriction was accepted.

Only an exact Commons `extmetadata.LicenseShortName` from this list is permitted:

- `Public domain`
- `CC0`
- `CC BY 2.0`, `CC BY 2.5`, `CC BY 3.0`, `CC BY 4.0`
- `CC BY-SA 2.0`, `CC BY-SA 2.5`, `CC BY-SA 3.0`, `CC BY-SA 4.0`

Localised or otherwise different labels are not silently treated as equivalent.
For example, `CC BY 2.5 au`, `CC BY 3.0 au`, GFDL, OGL, GODL, `CC BY-NC` and
`CC BY-ND` results were excluded. Licence metadata must be checked again immediately
before a file is shipped; search-result snippets are not evidence of permission.

Licences in the current manifest:

| Licence | Pictures |
|---|---:|
| Public domain | 51 |
| CC0 | 9 |
| CC BY 2.0 | 28 |
| CC BY 3.0 | 19 |
| CC BY 4.0 | 12 |
| CC BY-SA 2.0 | 13 |
| CC BY-SA 2.5 | 4 |
| CC BY-SA 3.0 | 23 |
| CC BY-SA 4.0 | 30 |

`Artist`, `Credit`, `LicenseShortName`, `LicenseUrl`, the canonical Commons file
page and `imageinfo.url` were captured from Commons. `original_url` preserves the
current `imageinfo.url` exactly, including Wikimedia-supplied `utm_*` parameters.
For public-domain files Commons supplies no `LicenseUrl`; `licence_url` is therefore
JSON `null`, while `source_url` remains the file-specific explanation of the
public-domain status.

## Credit obligations

The gallery presents the caption as alt text and shows the author, licence and a
link to the Commons file page. Keep the manifest's `credit` value even when the
shorter author string is used in the visible line: it records the source's own
credit statement and is part of the audit trail.

CC BY and CC BY-SA files require attribution. Retain the author, linked licence,
Commons source link and an indication that OPAX resized and recompressed the image.
WebP conversion and resizing may be an adaptation; derivatives of CC BY-SA work
must remain under the same licence. CC0 and public-domain files do not impose the
same attribution condition, but OPAX still displays their authorship and source as
an editorial provenance rule. Do not copy a WebP out of this directory without its
corresponding manifest record.

## Wikimedia Commons calls used

All API discovery and provenance checks used the public endpoint:

```text
https://commons.wikimedia.org/w/api.php
```

The work was split into three year ranges. The request shapes below are retained
separately because thumbnail widths, batch sizes and CORS parameters varied. Angle
brackets identify the query, category or file titles substituted for each request.
The recorded descriptive user agents included
`OPAX-pictures/1.0 (research; https://github.com/noice-computer/opax)` and
`OPAX-picture-research/1.0 (local editorial project)`.

### File and category discovery

1998–2007 file search:

```text
GET https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=<QUERY>&gsrnamespace=6&gsrlimit=50&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize%7Cmime&iiurlwidth=400&format=json&formatversion=2
```

Category discovery used the same request with `gsrnamespace=14`. Categories were
then traversed with either `gcmtype=file%7Csubcat` or `gcmtype=file`:

```text
GET https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:<CATEGORY>&gcmtype=file%7Csubcat&gcmlimit=max&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize%7Cmime&iiurlwidth=400&format=json&formatversion=2
```

2008–2017 file search:

```text
GET https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrnamespace=6&gsrlimit=40&gsrsearch=<URL-ENCODED-QUERY>&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize%7Cmime&origin=%2A
```

Its category requests used:

```text
GET https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&generator=categorymembers&gcmtitle=Category%3A<URL-ENCODED-CATEGORY>&gcmnamespace=6&gcmlimit=40&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize%7Cmime&origin=%2A
```

2018–2026 file search used the following parameters (sent to the same endpoint):

```text
action=query
format=json
formatversion=2
generator=search
gsrnamespace=6
gsrlimit=50
gsrsearch=<QUERY>
prop=imageinfo
iiprop=url|extmetadata|size|mime
iiurlwidth=320
```

Category traversal in that range used either:

```text
action=query
format=json
formatversion=2
list=categorymembers
cmtitle=Category:<CATEGORY>
cmtype=subcat|file
cmlimit=500
```

or, when fetching image metadata with the category members:

```text
action=query
format=json
formatversion=2
generator=categorymembers
gcmtitle=Category:<CATEGORY>
gcmtype=file
gcmlimit=100
prop=imageinfo
iiprop=url|extmetadata|size|mime
iiurlwidth=320
```

### Final metadata validation

The 30 selected 1998–2007 titles were rechecked together immediately before
download:

```text
GET https://commons.wikimedia.org/w/api.php?action=query&titles=<PIPE-SEPARATED-FILE-TITLES>&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize%7Cmime&format=json&formatversion=2
```

The 2008–2017 set was fetched in four batches of ten with:

```text
GET https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&titles=<10-URL-ENCODED-PIPE-SEPARATED-FILE-TITLES>&iiprop=url%7Cextmetadata%7Csize%7Cmime&iiurlwidth=1600&redirects=1&origin=%2A
```

Its 2012 replacement used the same properties with
`titles=File:NDIS rally Reddacliff Place Brisbane P1250205.jpg&iiurlwidth=1280`.
A final live check sent one form-encoded POST for all 40 titles:

```text
POST https://commons.wikimedia.org/w/api.php
action=query
format=json
formatversion=2
prop=imageinfo
titles=<40 PIPE-SEPARATED FILE TITLES>
iiprop=url|extmetadata|size|mime
redirects=1
maxlag=5
```

The 2018–2026 set used two POST requests of the same form, omitting `maxlag` and
splitting the 36 selected titles between them:

```text
POST https://commons.wikimedia.org/w/api.php
action=query
format=json
formatversion=2
redirects=1
prop=imageinfo
iiprop=url|extmetadata|size|mime
titles=<PIPE-SEPARATED-SELECTED-FILE-TITLES>
```

### Download and processing

Downloads first requested the `thumburl` returned by `imageinfo`, when present, or
the exact `imageinfo.url`. Commons' upload host returned HTTP 429 while the three
acquisition ranges were running concurrently. The remaining bytes came from
Commons-rendered derivatives through standard `thumb.wikimedia.org` paths or:

```text
GET https://commons.wikimedia.org/w/thumb.php?f=<COMMONS-FILENAME>&w=<ASPECT-AWARE-WIDTH>
```

Those renderer outputs are derivatives of the exact Commons files validated above.
It would be incorrect to describe every downloaded input as the original upload;
the manifest deliberately keeps the original `imageinfo.url` in `original_url`, not
the temporary thumbnail-fetch URL.

ImageMagick auto-oriented each downloaded input, resized it without upscaling or
cropping, stripped embedded metadata and encoded WebP. The common command shape was:

```sh
magick INPUT -auto-orient -resize '1600x1600>' -strip -quality 82 -define webp:method=6 OUTPUT.webp
```

The target width was sometimes already 1,280 or 960 pixels because a Commons
renderer derivative was used. Dense frames were stepped down in pixel dimensions;
a few older high-detail frames used quality 79–80. No output axis exceeds 1,600
pixels, and the batch targets no more than 180 KiB per image.

## Search record

The following terms and categories summarise the searches actually made. Thin and
zero-result searches are included so a refresh does not repeat the assumption that
Commons must contain a suitable picture.

### 1998–2007

File searches:

- 1998: `1998 Australian waterfront dispute`; `1998 Australian federal election campaign`;
  `John Howard 1998 Australia election`; `insource:"1998" Kim Beazley Australia`;
  `insource:"1998" John Howard election`; `insource:"1998" Pauline Hanson election`;
  `insource:"1998" waterfront dispute Australia`; `Jabiluka protest 1998 Australia`;
  `native title rally Australia 1998`; `GST campaign Australia 1998`.
- 2000: `Corroboree 2000 reconciliation walk Sydney Harbour Bridge`;
  `Sydney Olympics 2000 opening ceremony`.
- 2001: `Tampa 2001 Australia asylum`; `Ansett collapse 2001 protest`;
  `insource:"2001 Australian federal election" filetype:bitmap`;
  `Kim Beazley 2001 election Australia`; `Australian election day 2001 polling`;
  `Ansett Australia 2001 workers`; `insource:"Ansett" insource:"2001"`.
- 2002: `2002 drought Australia`; `2002 Bali bombing Australian memorial`;
  `Woomera protest 2002 Australia`; `Easter 2002 Woomera detention centre protest`;
  `refugee protest Australia 2002 detention`;
  `insource:"2002" incategory:"Droughts in Australia"`;
  `Australian drought cattle 2002`; `Australia drought 2002 satellite`;
  `Bali bombing October 2002 Kuta`; `Bali bombing aftermath 2002`.
- 2005: `WorkChoices protest 2005 Australia`.
- 2006: `AWB Cole inquiry 2006 Australia`; `Kevin Rudd Julia Gillard leadership 2006`;
  `insource:"2006" nuclear protest Australia`; `insource:"2006" climate protest Australia`;
  `Walk Against Warming Australia 2006`; `insource:"2006" AWB Australia wheat`;
  `G20 protest Melbourne 2006`; `media ownership protest Australia 2006`.

Category searches covered the 1998 federal election and waterfront dispute; Wik and
native title; the 1999 republic referendum and East Timor; the 2000 reconciliation
walk, Olympics and GST; the Tampa affair, 2001 election and Ansett; Bali memorials;
the 2003 Iraq protests and Canberra fires; the 2004 election and Tasmanian forests;
WorkChoices; the 2005 anti-terrorism debate; the 2006 AWB inquiry and nuclear debate;
and the 2007 election, climate campaign and Murray-Darling drought.

Traversed categories included `1998 in Australia`, `1998 photographs of Australia`,
`1998 events in Australia`, `April 1998 Australia photographs`, `1998 elections in
Australia`, `1998 events in Victoria, Australia`, `1998 events in Australia by city`,
`1998 events in Melbourne`, `International Force East Timor`, `2000 Summer Olympics
opening ceremony`, `Ansett Australia`, `John Howard in 2001`, `2002 Bali bombings`,
`Droughts in Australia`, `2003 Canberra bushfires`, `Australian federal election,
2004`, the Melbourne and Sydney industrial-relations protest categories,
`John Howard in 2006`, `Kevin Rudd in 2006`, `2006 in Australia`, `2006 in Melbourne`
and `Australian federal election, 2007`.

### 2008–2017

Useful file searches included:

- `Kevin Rudd apology stolen generations 2008`
- `Black Saturday bushfires 2009 Australia`
- `2009 climate protest Australia parliament carbon`
- `intitle:"carbon tax" Australia filetype:bitmap`
- `Queensland floods 2011 Brisbane`
- `intitle:"NDIS rally Reddacliff Place Brisbane" filetype:bitmap`
- `intitle:NDIS 2012 Australia filetype:bitmap`
- `intitle:budget protest Australia 2014 filetype:bitmap`
- `intitle:March in May Australia 2014 filetype:bitmap`
- `intitle:Turnbull sworn 2015 filetype:bitmap`
- `China Australia free trade agreement signing 2015 filetype:bitmap`
- `intitle:postal survey Australia 2017 filetype:bitmap`
- `intitle:marriage equality Australia 2017 filetype:bitmap`
- `Hazelwood power station closure 2017 filetype:bitmap`

Useful categories were `Australian federal election, 2010`, `Australian federal
election, 2013`, `Tony Abbott in 2013`, `Kevin Rudd in 2013`, `Malcolm Turnbull in
2015`, `Tony Abbott in 2015`, `Australian federal election, 2016` and `Same-sex
marriage rally in Melbourne, 26 August 2017`.

### 2018–2026

- 2018: `2018 Australian leadership spill`; `2018 Australia politics`;
  `"Wentworth by-election" 2018`; `live sheep export protest Australia 2018`;
  `banking royal commission Australia 2018`; `Scott Morrison swearing in 2018 Australia`;
  categories `2018 in politics of Australia`, `Demonstrations and protests in Australia
  in 2018`, `2018 elections in Australia`, `2018 Wentworth by-election`.
- 2019: `"2019 Australian federal election"`; `climate strike Australia 2019`.
- 2020: `COVID-19 Australia press conference 2020 Morrison`; `Scott Morrison COVID 2020`;
  categories `COVID-19 pandemic in Australia`, `COVID-19 pandemic checkpoints in
  Australia`, `Social distancing during the COVID-19 pandemic in Australia`.
- 2021: `March 4 Justice Canberra 2021 Parliament House`; categories `Women's March 4
  Justice`, `Women's March 4 Justice in Melbourne`, `COVID-19 vaccination in Australia`.
- 2022: `"2022 Australian federal election"`; category `2022 in politics of Australia`.
- 2023: `"Voice referendum" Australia 2023`; category `2023 Australian Indigenous Voice
  referendum`.
- 2024: `"Anthony Albanese" 2024`; `"Jim Chalmers" 2024`; `AUSPIC 2024 Australia
  parliament`; `"2024 Dunkley by-election" OR "2024 Cook by-election"`; `Australia
  climate protest 2024`; each of the four curated topic phrases; categories `2024 in
  politics of Australia`, `Demonstrations and protests in Australia in 2024`.
- 2025: `"2025 Australian federal election"`; `2025 Australian election results
  declaration candidate`; category `2025 Australian federal election`.
- 2026: `"Anthony Albanese" 2026`; category `2026 in politics of Australia`.

## Second pass: bringing every year to six to eight

A follow-up brief, "more photographs for the year in pictures", raised the target
from at least one photograph per year to six to eight, added to what the first pass
shipped rather than replacing it. It ran entirely on branch `ui-pictures2`, in three
sittings across 2026-09-05, and added 88 photographs (101 to 189) using the same
Commons-only method and licence allow-list, plus a small Python toolchain kept in the
working scratchpad (`commons.py` to harvest candidates by search, category and
category recursion into a per-year JSON file; `list.py` and `q.py` to triage them as
compact text; `sheet.py` to build numbered contact sheets for visual review; `desc.py`
to re-fetch full metadata for shortlisted titles; `ingest.py` to re-check licences
live, download, resize, encode WebP and append the manifest entry).

Priority followed the brief: 2002 first (0 to 7), then the other years under four
(1998, 1999, 2001, 2006), then every remaining year under six or seven, finishing
with 2018, 2019, 2020, 2022, 2023, 2024, 2025 and 2026. The recorded Commons API call
counts from harvesting alone were 47 (1998–1999), 253 (1998–2007), 481 (2013,
2014, 2023–2026) and 133 (2022); the 2008–2012 harvest's own tally line was not
retained in the kept log, and one-off `q.py` and `desc.py` checks add a further
small number of calls beyond that. All of it used the same public, unauthenticated
`commons.wikimedia.org/w/api.php` endpoint documented above; none of it was Firecrawl
or any paid API.

A deliberate rule in this pass was series diversity: no year was allowed to reach
its target by taking four or five frames from a single photographer's shoot of a
single moment. Every addition was checked against what a year already had and
picked from a different event, date or photographer where more than one candidate
covered the same story (for example 2019 gained a federal-election polling photo
and a Black Summer bushfire-smoke photo rather than two more frames of the existing
Sydney climate strike; 2020 gained a bushfire-aftermath photo and a Black Lives
Matter rally photo rather than a fourth COVID-checkpoint frame; 2026 gained a state
election forum, the State Opening of the South Australian Parliament and a student
protest against Pauline Hanson, three different events rather than three frames of
one).

1998 and 1999 were re-searched exhaustively in this pass (see the table note above)
and stayed at four: no compliant photograph of the GST, native title, Telstra's
sale, the republic referendum or aged care was found on Commons under any of the
allowed licences.

## Firecrawl

Firecrawl call count: **0**, across both passes. Neither of the permitted discovery
endpoints was called:

```text
POST https://api.firecrawl.dev/v2/search
POST https://api.firecrawl.dev/v2/scrape
```

Commons search and category traversal were sufficient, so the Firecrawl credential
was not read or sent. No paid LLM or other paid API call was made.

## Curation notes and known caveats

- Photographs centring children, unidentified private individuals or a person in
  distress were rejected. Named public figures and speakers, and wide public-event
  crowds, were retained. Maps, charts, signatures, logos, standalone posters, generic
  buildings and undated portraits were also rejected.
- 1998 and 1999 hold four photographs each after exhaustive re-searching in the
  second pass; see the table note above. In 2002 the only same-year drought candidate
  centred a private farmer; Bali results were later memorial/site photographs and no
  Woomera file surfaced, so 2002's seven photographs are carried entirely by other
  same-year Australian public business. In 2006 the AWB, nuclear and media-ownership
  searches returned PDFs, logos or unrelated material.
- Several archival sources are small: the 1999 Karabela frame is 508×253; several 2004
  election files are 318–606 pixels wide; and the 2006 G20 frame is 400×266. Expect
  softness on a large gallery mat. They must not be upscaled or sharpened into false
  detail.
- All four 2000 pictures are from the Olympics opening ceremony. Commons did not yield
  a compliant same-year reconciliation-walk photograph.
- The retained 2006 G20 photograph centres a named public activist. Reconsider it if a
  later editorial rule limits the gallery strictly to the four curated topics.
- The 2012 NDIS selection is a wide rally view. An earlier frame was removed because it
  centred an identifiable private participant using a wheelchair. A 2017 image centred
  on a private participant and sign was likewise replaced with Hazelwood's closure.
- The 2019 Sydney strike files have EXIF timestamps late on 19 September; their Commons
  titles and descriptions identify the public event as 20 September 2019, which is the
  date used in the captions.
- Commons coverage of the four 2024 curated topics was extremely thin. The year uses
  one climate-finance protest and three specific freely licensed Australian
  parliamentary or diplomatic events. A stricter topic-only edit should make 2024 a
  short year rather than substitute unrelated imagery.
- Captions are newly written factual sentences, not copied headlines. Every accepted
  image was reviewed in a contact sheet; future batches must also be viewed before
  shipping.

## Refresh

1. Read the year's current `YEAR_TOPICS` and `years/<year>.json` brief. Write down the
   event, year and likely Commons category before searching.
2. Search the file namespace and likely categories with `imageinfo` requesting
   `url|extmetadata|size|mime`. Reject non-photographs, irrelevant dates, unsafe
   subjects and every licence outside the exact allow-list above.
3. Open the full Commons file page and inspect the image. Do not approve from a small
   search thumbnail. Aim for six to eight distinct event photographs drawn from more
   than one series or moment, but ship fewer when the evidence is thin.
4. Batch the exact selected `File:` titles through a fresh `imageinfo` request. Record
   `Artist`, `Credit`, `LicenseShortName`, `LicenseUrl`, `canonicaltitle`,
   `descriptionurl` and `url` from that response. A missing public-domain licence URL
   becomes `null`, not a guessed link.
5. Fetch the API-provided thumbnail or original URL. If the upload host throttles,
   request an aspect-aware Commons renderer derivative. Keep the API's exact original
   upload URL in `original_url`, irrespective of the download path used for processing.
6. Auto-orient, resize without cropping or upscaling, strip metadata and encode WebP at
   about quality 82. Step down dimensions before quality when necessary. Record the
   output's real width and height, and keep the long edge at or below 1,600 pixels.
7. Write one plain factual caption stating what and when; use it as the alt text. Add
   the output to `pictures.json`, including a short event name and ISO date when known.
8. Run `node portal/test/pictures.test.mjs`. It checks required fields, allowlisted
   licences, URLs, WebP signatures, recorded dimensions, file/orphan parity and the
   size budget. Inspect a contact sheet and the gallery at phone and desktop widths;
   check portrait and landscape images, credits, keyboard focus and overflow.

