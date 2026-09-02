# OPAX influence data: the Foreign Influence Transparency Scheme register

Status 2026-09-02: **the whole public register is loaded** into four additive `ext_fits_*`
tables in `parli.db` (host `desktop`, `/home/jake/.cache/autoresearch/parli.db`), matched to
OPAX donors, lobbying firms and parliamentarians, and exported to `portal/public/fits.json`
for the encyclopedia pages. Nothing pre-existing was touched; every load is in
`ext_ingest_log` (source `agd_fits_register`).

| Table | Rows | What a row is |
|---|---:|---|
| `ext_fits_registrants` | 145 | a registrant (96 organisations, 49 individuals); 49 have a current foreign-principal relationship |
| `ext_fits_principals` | 464 | a foreign-principal record. The register keys these per registrant relationship, so "Government of the People's Republic of China" appears once per registrant that acts for it |
| `ext_fits_registrations` | 464 | the registrant <-> principal relationship: commencement, cease, status, distinct activity types, activity descriptions |
| `ext_fits_activities` | 728 | a registrable activity (parliamentary lobbying 186, general political lobbying 186, former Cabinet minister / designated position holder 176, communications 152, disbursement 28) |

Loader: `parli/ingest/fits_register.py` (house `ExtWriter` pattern from `ext_common.py`;
gzip JSONL over ssh, one transaction, `timeout=600`, replace per source). Export:
`scripts/export_fits.py`. Client: `portal/public/app.js` (`loadFits`, `fitsInfoRow`, the
Donors directory marker).

## 1. Source

The scheme (Foreign Influence Transparency Scheme Act 2018, commenced 10 December 2018)
requires anyone undertaking registrable activities in Australia on behalf of a foreign
principal, for the purpose of political or governmental influence, to register with the
Attorney-General's Department. Former Cabinet ministers and recent "designated position
holders" register any activity for a foreign principal, which is why former prime ministers
appear. **Registration is a disclosure the law requires; it is not a finding of wrongdoing**,
and every OPAX surface that shows a registration says so.

| Item | Detail |
|---|---|
| Register | `https://foreigninfluence.ag.gov.au/` (Next.js app on Azure App Service `prodfissearchportal-auac.azurewebsites.net`). The old address `https://transparency.ag.gov.au/` is now a static page pointing here; it has no data |
| Data access | Same-origin JSON API behind the search pages, DataTables-style. Form-encoded `POST` with `start`, `length` (silently capped at **100**) and `sort`; response `{draw, recordsTotal, recordsFiltered, data[]}`. Records are nested: registrants carry `foreignPrincipals[]`, principals carry `activities[]` and `registrant`, activities carry both parents |
| Endpoints | `POST /api/advancedSearch/_search` (registrants), `POST /api/ForeignPrincipals/_Search`, `POST /api/Activities/_Search`; `GET /api/Registrants/Details/{id}` (one registrant, everything nested). Anonymous; `GET` on a search endpoint is 405 |
| Bulk download | The pages' "Download" controls are anonymous `GET`s returning `.xlsx` of the whole register with no parameters: `/api/advancedSearch/exportExcel`, `/api/advancedSearch/exportExcelWithActivities`, `/api/foreignPrincipals/exportExcel`, `/api/foreignPrincipals/exportExcelWithActivities`, `/api/activities/exportExcel` (e.g. `20260902 - FITS registrant export.xlsx`, 16 KB). The JSON API is used instead because it carries the record GUIDs the profile URLs need |
| Profile URLs | `https://foreigninfluence.ag.gov.au/Profile/{registrationId}` with `?page=ForeignPrincipals#{principalId}` or `?page=Activities#{activityId}` |
| Format quirks | `length` > 100 returns 100; timestamps are AEST/AEDT ISO (`2022-02-27T12:16:16+11:00`), activity dates are bare (`2025-06-23T00:00:00`); every record has `*Highlighted` and `*FilterText` presentation fields, dropped from `raw`. The site shows a notice about an unfiltered search page sometimes reporting 0 results: the loader retries a zero page and refuses to load an empty register |
| Update cadence | Continuous. Registrants must report changes within 14 days and renew annually; every record has `lastUpdated`. Re-run the loader whenever; it replaces the source in one transaction |
| Licence | **CC BY 4.0**, verified 2026-09-02 by fetching the statement itself. The register's footer "Copyright" link (in its client bundle, `/_next/static/chunks/25ia6gg46u77v.js`, and on the old domain's notice page) is `https://www.ag.gov.au/copyright-statement`, which reads: "All material presented on this website is provided under a Creative Commons Attribution 4.0 International licence, with the exception of: the Commonwealth Coat of Arms, this department's logo, content supplied by third parties," and "Material obtained from this website is to be attributed to this department as: © Commonwealth of Australia 2026." Registrants write their own descriptions, so the free-text `description` fields are arguably third-party content; OPAX shows names, countries, dates and activity types, and links to the register for the text |
| Politeness | One request a second, `User-Agent: OPAX/1.0 (+https://opax.com.au)`, raw pages cached under `~/.cache/autoresearch/fits/<date>/`. A full pull is 15 requests |

## 2. What was pulled

145 registrants, 464 foreign-principal records, 728 activities (2026-09-02). Foreign
principals by type: foreign government related entity 346, foreign government 85, foreign
political organisation 28, foreign government related individual 5. Most-named countries in
the first 100 records: China, United States, United Arab Emirates, Germany, United Kingdom,
France. 49 of the 145 registrants have at least one current relationship; the rest are
wholly ceased (the register keeps ceased relationships).

Schema notes (field names follow the register's camelCase, snake_cased):

- `ext_fits_registrants(registrant_id, name, title, postnominals, other_names, trading_name,
  abn, foreign_business_number, registrant_type, registrant_type_id, occupation,
  registered_from, registered_to, status, principal_count, activity_count, last_updated,
  source_url, raw, ingested_at)`. The register publishes **no registration date**;
  `registered_from` is the earliest relationship commencement, `registered_to` the latest
  cease date once every relationship has ceased, `status` current|ceased from the same.
- `ext_fits_principals(principal_id, registrant_id, name, title, postnominals, country,
  principal_type, principal_type_id, description, abn, foreign_business_number,
  commencement_date, cease_date, is_ceased, activity_count, last_updated, source_url, raw,
  ingested_at)`; `country` is the `countries[]` list joined with `; `.
- `ext_fits_registrations(registrant_id, principal_id, registrant_name, principal_name,
  country, activity_types, start_date, end_date, status, purpose_summary, activity_count,
  source_url, ingested_at)`. `start_date`/`end_date` are the relationship's
  `commencementDate`/`ceaseDate` (named `*_date` rather than `start`/`end` because `END` is
  an SQLite keyword); `purpose_summary` is the activities' descriptions joined with ` | `,
  cut at 1,000 characters.
- `ext_fits_activities(activity_id, registrant_id, principal_id, registrant_name,
  principal_name, activity_type, activity_type_id, start_date, end_date, cease_date,
  description, disbursement_events, last_updated, source_url, raw, ingested_at)`.
- `raw` on registrants, principals and activities is the register's record as JSON with the
  presentation fields and nested children removed.

## 3. Matching to OPAX entities

`scripts/export_fits.py` runs read-only on the box and needs the portal inputs beside it:

```
ssh desktop mkdir -p /tmp/opax-fits/graph
scp portal/public/graph/money*.json desktop:/tmp/opax-fits/graph/
scp portal/public/access.json portal/public/parliamentarians.json desktop:/tmp/opax-fits/
ssh desktop python3 - --portal /tmp/opax-fits < scripts/export_fits.py > portal/public/fits.json
```

Method, so the counts can be defended:

1. **Organisations** match exactly after normalisation (lower-case, punctuation to spaces,
   drop pty/ptd/ltd/limited/the/inc/co/holdings/group/australia/proprietary/incorporated). The
   registrant's registered name, trading name and "other names" are each tried against the
   donor label (money.json, money.qld.json, money.vic.json donor nodes and access.json donor
   keys) and against `ext_lobbyists.entity_name` / `trading_name`. Keys that collapse to one
   generic word, and placeholder names ("N/A", "none"), are skipped, and an **individual**
   registrant is indexed under their registered name only — their trading/"other" names are
   nicknames ("Josh" for Joshua Zwar, "Will" for William Clancy) and as organisation keys
   would let a one-word donor label match a person. No fuzzy or prefix matching: a company
   that registers under another spelling is under-counted, never over-counted. "Hawker Britton
   Pty Ltd" (donor) meets "Hawker Britton Group Pty Limited" (registrant) because `group` is
   dropped; `ptd` is dropped only because the AEC returns misspell "Pty" that way, which is
   the sole reason "Chevron Australia Ptd Ltd" reaches "Chevron Australia Pty Ltd".
2. **Lobbying firms** also match on ABN where both registers publish one (11 digits).
3. **Parliamentarians** (`parliamentarians.json`, 1,427 speaker pages) match on surname plus
   first name after dropping titles (Hon, Dr, Mr...), post-nominals (AC, AO...) and middle
   names, and after folding common short forms (Anthony/Tony, Patrick/Pat,
   Christopher/Chris...). Bare-surname pages (QLD Hansard speakers) never match, so a
   namesake in another parliament cannot inherit a registration. Deliberate non-matches:
   "Andrew Joyce" (registrant) vs Barnaby Joyce, "Andrew Porter" vs Christian Porter,
   "David Palmer" vs Clive Palmer, "Ian Hawke" vs Alex Hawke, "Robert Murray Hill" vs
   Julian Hill. Former senators Richard Alston, Nick Bolkus and Robert Hill are registrants
   but have no OPAX page (their speeches predate or fall below the corpus floor).

Match counts (2026-09-02):

| OPAX side | Matched | Names |
|---|---:|---|
| Donors (donor nodes in three money files + access.json keys) | **9** | Santos Limited; Woodside Energy Ltd; Hawker Britton Pty Ltd; Chevron Australia Ptd Ltd; Anacta Strategies Pty Ltd; Australia Pacific Lng Pty Limited; Northstar Public Affairs Pty Ltd; Barton Deakin Pty Limited; TG Public Affairs. The Donors index shows **10** rows with the marker: it also matches a donor row whose name is a registered lobbying firm ("Hawker Britton Group Pty Limited") |
| Lobbying firms (`ext_lobbyists`, six registers) | **62** firm names (several are the same firm spelled differently across registers: FTI Consulting x4, CMAX x4, Hawker Britton x3) | A.GR Advisors, Anacta Strategies, Barton Deakin, Brockwell Strategy, Brunswick Advisory, Cahill and Bailey, Cannings Advisory, CMAX Advisory, Cornerstone, Counsel House, CPR Communications, Domestique Consulting, DPG Advisory, Dragoman, EJF Advisory, FTI Consulting, GRA Partners, GRACosway, Halliday Advisory, Hawker Britton, Hill+Knowlton, Horizon GR, Indo Pacific Advisory, John Connolly & Partners, Lunik, Northstar Public Affairs, Precision Public Affairs, PremierNational, Pyne and Partners, Richardson Coutts, SEC Newgate, TG Public Affairs, Wilkinson Butler and others |
| Parliamentarians (pages) | **11** pages, 10 people | Tony Abbott (= registrant "Anthony Abbott"), Scott Morrison, Kevin Rudd, Malcolm Turnbull, Christopher Pyne and Chris Pyne (two pages for the same person), Alexander Downer, Simon Crean (= "Simon Findlay Crean"), Brendan Nelson (= "Brendan John Nelson"), George Christensen, Patrick Farmer |

`portal/public/fits.json` is 115 KB, 11 KB over the wire (65 entity keys, 11 person keys):
`{meta, by_entity: {normName(label): [registration...]}, people: {normName(page): [...]}}`,
each registration `{registrant, principal, country, activities[], from, to, status, url,
occupation?}`, current first then newest first. Keys use the same `normName()` as
`app.js`. `meta` carries the source, licence, table counts, match counts, the matched
parliamentarians and the disclaimer sentence.

Deliberate near-misses, checked by hand (token-overlap scan over every donor label against
every registrant name): "Santos GLNG Pty Ltd" is a registrant of its own and does **not**
inherit the "Santos Limited" donor page (the donor matches the separate registrant "Santos
Ltd"); "TG Public Affairs" / "Northstar Public Affairs" / "Precision Public Affairs" share
only the words "public affairs" and never cross.

## 4. Exposure on the site

- **Donor and person entry pages**: a "Foreign influence" row in the Quick facts infobox when
  the entry matches: "Registered under the Foreign Influence Transparency Scheme for
  *Principal* (Country), since 2021", up to two principals then "and N other current
  principals" — one line per principal, newest term first, because a registrant that renews
  for the same principal has a row per term and naming it twice reads as two principals —
  then "N earlier relationships have ceased" as a separate count; a registrant
  with nothing current instead reads "Was registered … 2019–2020; every relationship has
  ceased", so the tense is never wrong. Then a "Register entry ↗" link to the registrant's
  profile and the fineprint "Registration is a disclosure the scheme requires by law, not a
  finding of wrongdoing." A donor entry outside the money map gets the row too when the name
  matches, which is where the lobbying-firm keys earn their place: most matched firms are
  donor rows in their own right (Hawker Britton, Anacta, Barton Deakin, Northstar, TG Public
  Affairs), and the rest answer any donor entry opened by name. The register's own firm names
  are not linked from the donor page's "Registered lobbying client of" list, which is plain
  text. The label is two words because the infobox's label column is `auto`-sized: a
  longer term ("Foreign influence register") widens it and squeezes every other value.
- **Donors index**: a `FITS` marker chip beside the existing `lobbyists` / `meetings`
  markers, a "Foreign influence register" checkbox filter, and a sentence in the fineprint.
- Not done: no dedicated section listing every principal on the entry page (the infobox row
  and the register link carry it); nothing in the ARAG knowledge base; no party-page use
  (parties do not register); the register's free-text activity descriptions
  (`ext_fits_activities.description`, `ext_fits_registrations.purpose_summary`) are loaded
  but not shown anywhere.

## 4a. Verification (2026-09-02)

- **Complete, not truncated**: the API's `recordsTotal` (145 / 464 / 728) equals the rows
  loaded and the distinct record ids in the cached pages; a re-query of the live search
  endpoint the same day still reports 145 registrants. The loader refuses a zero total.
- **Field-for-field spot checks** against `GET /api/Registrants/Details/{id}` and against the
  rendered profile pages: Anthony Abbott (5 principals, Danube Institute active since
  05/03/2026, 4 ceased — the register's own profile page says the same), Kevin Rudd (80
  principals, 6 current), Santos GLNG Pty Ltd, Anacta Strategies, George Christensen, Patrick
  Farmer, Hawker Britton Group (12 principals). Names, countries, commencement and cease
  dates, `isCeased`, activity counts and activity types all agree; ABNs agree after digits-only
  normalisation ("64 633 978 677" -> `64633978677`).
- **Rendered surfaces** checked in headless Chrome against `wrangler dev`: the infobox row on
  a matched donor page (Woodside Energy Ltd), a matched person page (Tony Abbott), a donor
  page outside the money map (CMAX Advisory), and the `FITS` chip plus its filter on the
  Donors index (10 of 695 donors).

## 5. Refresh

```
PYTHONPATH=. python -m parli.ingest.fits_register            # ~20 s; replaces source agd_fits_register
# then the export block in section 3, then redeploy the portal
```

Add `--refresh` to ignore the day's cached pages, `--dry-run` to fetch without writing,
`--db /tmp/x.db` to load a local file. The loader raises if the register reports zero
records rather than emptying the tables.
