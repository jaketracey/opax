# OPAX money data: sources, what was pulled, quality, exposure

Status 2026-09-02: **acquisition complete for everything that is machine-readable.**
Every source below is loaded into additive `ext_*` tables in `parli.db` (host `desktop`,
`/home/jake/.cache/autoresearch/parli.db`); nothing pre-existing (`donations`,
`mp_expenses`, `ministerial_meetings`, `federal_lobbyists*`, `contracts`) was touched.
Every load is recorded in `ext_ingest_log`. Nothing has been pushed to the ARAG
knowledge base; every KB idea below is marked as the user's cost decision.

| Table | Rows | Sources | Coverage |
|---|---:|---|---|
| `ext_donations` | 35,730 | QLD ECQ, VIC VEC, WA WAEC | 2012-13 to 2026-27 (see per-source) |
| `ext_expenses` | 1,229,512 | IPEA (37 quarters) | 1 Apr 2017 to 30 Jun 2026 |
| `ext_ministerial_meetings` | 61,499 | NSW Cabinet Office, QLD Cabinet (current govt) | NSW 2019 Q1 to 2026 Q2; QLD Nov 2024 to Jul 2026 (+1 Feb-2013 diary) |
| `ext_lobbyists` | 1,943 | AGD, NSW EC, QLD Integrity, VPSC, SA DPC, WA PSC | current registers incl. deregistered where published |
| `ext_lobbyist_clients` | 14,922 | same six | |
| `ext_lobbyist_people` | 5,943 | same six | |
| `ext_lobbyist_contacts` | 8,235 | QLD Integrity contact log | Sep 2016 to Sep 2026 |
| `ext_aec_debts` | 14,680 | AEC Transparency Register (annual returns bundle) | 2000-01 to 2024-25 |
| `ext_aec_benefits` | 1,102 | AEC Transparency Register | discretionary benefits 2018-19 to 2024-25; capital contributions 2000-01 to 2024-25 |
| `ext_aec_returns` | 20,983 | AEC Transparency Register | 1998-99 to 2024-25 (see §1.5) |

Fetchers (all `parli/ingest/`): `money_state_donations.py`, `money_ipea.py`,
`money_diaries.py`, `money_lobbyists.py`, `money_classify.py`, `money_aec_extras.py`; shared plumbing in
`ext_common.py` (session/UA, date+money parsing, Power Pages grid client, `ExtWriter`
that ships gzip JSONL over ssh and loads inside one transaction). Everything identifies
as `OPAX research (opax.com.au; contact jake.tracey@noice.work)` and rate-limits.

## 1. Source register

### 1.1 State political-donation disclosures -> `ext_donations`

| Jurisdiction | Endpoint | Format | Licence | Coverage | Cadence | Status |
|---|---|---|---|---|---|---|
| **QLD** ECQ Electronic Disclosure System | `POST https://disclosures.ecq.qld.gov.au/Map/ExportCsv` with the page's anti-forgery token and empty filters (the "Download CSV" button on the Donor Location Map) | one CSV, whole register (~2.3 MB) | **CC BY 4.0** (data.qld.gov.au dataset "Electronic Disclosure System - State and Local Election Funding and Donations") | 2012-13 onwards; real-time since 2017 (gifts published within 7 business days) | continuous | **pulled in full: 23,618 gifts, $85.0m** |
| **VIC** VEC Disclosures portal | Power Pages entity list `pit_donation` on `https://disclosures.vec.vic.gov.au/public-donations/` via `/_services/entity-grid-data.json` (page size 5000) | JSON grid | Crown copyright (State of Victoria); no explicit open licence on the portal; published under Electoral Act 2002 s 217 | scheme began 25 Nov 2018; rows in the public grid date from 2020-21 | continuous (21-day disclosure) | **pulled in full: 4,237 donations, $11.4m** |
| **WA** WAEC Online Disclosure System | Power Pages entity list `waec_disclosure` on `https://disclosures.elections.wa.gov.au/public-dashboard/` | JSON grid; dates render m/d/yyyy | **Full Crown copyright, no open licence** (WAEC copyright notice) | real-time gifts since 1 Jul 2024; earlier years are PDF annual returns | continuous (7-day disclosure) | **pulled in full: 7,875 disclosures, $16.2m** (public exposure is a licence gate) |
| **TAS** TEC | two registers read together: the monthly + seven-day disclosure report tables on `https://www.tec.tas.gov.au/disclosure-and-funding/registers-and-reports/donations/` (static HTML fragments the page pulls in with its own `includeHTML()`), and the Power Pages entity list `vec_publisheddonation` on `https://disclosures.tec.tas.gov.au/public-donations/` | HTML tables + JSON grid | **CC BY 4.0** (TEC copyright page) | scheme commenced **1 Jul 2025**; nothing earlier exists | monthly, or 7-day in a campaign period | **pulled in full: 264 donations, $1.53m** |
| **ACT** Elections ACT "Gift returns" | one HTML page per financial year under `https://www.elections.act.gov.au/funding-disclosures-and-registers/gift-returns/`, a table per recipient (`From \| Date reported \| Date gift received \| Amount \| Type \| Description`) | HTML tables | **No open licence** (ACT Electoral Commission copyright) | 2012-13 to 2026-27 | quarterly; 7-day in an election year | **pulled in full: 8,207 gifts, $7.64m** (public exposure is a licence gate) |
| **NT** NTEC published returns | annual returns (2014-15 on; separate "annual returns - gifts" pages from 2020-21) and Legislative Assembly election returns under `https://ntec.nt.gov.au/financial-disclosure/`. The site returns HTTP 403 to non-browser clients (Cloudflare managed challenge, confirmed from both OPAX hosts 2026-09-02), so pages are read from Internet Archive raw captures (`web.archive.org/web/<ts>id_/<url>`) | HTML tables | **No open licence** (NT Government copyright) | FY 2014-15 to 2024-25 | annual + per election | **pulled in full: 2,266 rows, $29.1m** (public exposure is a licence gate) |
| **NSW** Electoral Commission "Funding and disclosure online" | `https://efadisclosures.elections.nsw.gov.au/` (Salesforce Visualforce app `FDCLiteDisclosures`; has a `getDownloadURL` remoting action) | interactive search only; no published bulk file (the "downloadable resources" anchor on the disclosures page is empty; data.nsw.gov.au has only annual-report PDFs) | site terms: **"You are not allowed to use any software (like bots, scraper tools etc.) to access, monitor or copy the portal or its contents"**; robots.txt Content-Signal `ai-train=no` | 2018-19 onwards online | half-yearly + pre-election real time | **not pulled (terms).** Path: the Commission emails copies on request (`fdc@elections.nsw.gov.au`, stated on the View Disclosures page) -- ask for a CSV extract |
| **SA** ECSA | `https://www.ecsa.sa.gov.au/parties-and-candidates/disclosure-returns-%E2%80%93-state-elections` | ~18 PDF returns per election (party + associated-entity returns, edocman downloads); `disclosures.ecsa.sa.gov.au` no longer resolves | not stated (SA Government default CC BY) | 2022 state election returns; **SA banned political donations from 1 Jul 2025** | per election | **not pulled (PDF only, scheme ended).** Low value; skip |
| Federal AEC | already in `donations` (199,233 rows, 1998-99 to 2025-26) | | | | | receipts out of scope here; debts, benefits and return totals are §1.5 |

Unified schema (`ext_donations`): `jurisdiction, source, source_record_id, donor_name,
donor_type (individual|organisation|other), donor_suburb/state/postcode, recipient,
recipient_type (party|candidate|committee|other), recipient_party (canonical bucket),
amount, date_made, date_received, financial_year (AEC-style), disclosure_type, election,
is_political_donation (QLD flag), status, version (WA Original/Amended), industry,
industry_source, source_url, ingested_at`. Loads replace per `source`.

QLD, VIC, WA are `parli.ingest.money_state_donations`; TAS, ACT, NT are
`parli.ingest.money_small_jurisdictions` (same DDL, same columns, same writer).

#### Licence verdicts, TAS / ACT / NT (checked 2026-09-02)

The rule is the one WA set: data may stay in `parli.db` for internal analysis
whatever the licence says, but nothing is served from `portal/public/` unless the
commission has actually granted reuse. `scripts/export_state_money.py` enforces
it -- a gated jurisdiction refuses to export at all without `--gated`, and a
`--gated` copy must never be written under `portal/public/`.

**Tasmania -- OPEN, exposed.** <https://www.tec.tas.gov.au/info/Copyright.html>:

> Unless otherwise noted, the TEC has applied the Creative Commons Attribution
> 4.0 International Licence to all material on this website with the exception
> of: TEC logos, and content supplied by a third party.

Required attribution is `© Tasmanian Electoral Commission`, carried in the
`meta.licence` of `money.tas.json`. One caveat worth recording: the
`disclosures.tec.tas.gov.au` portal is a separate subdomain that carries **no
licence statement of its own** (its Legal / Accessibility / Sitemap footer links
are dead and its Privacy page is a collection notice only). We read the
site-wide TEC licence as reaching it. Only 11 of the 264 rows come from that
subdomain; the other 253 come from `www.tec.tas.gov.au`, squarely inside the
quoted grant.

**ACT -- RESTRICTED, gated.**
<https://www.elections.act.gov.au/about-the-commission/copyright> permits use
only "for your personal use, educational use or for non-commercial use within
your organisation", "in unaltered form only", and then:

> Except as permitted above you must not copy, adapt, publish, distribute or
> commercialise any material contained on this site without the permission of
> the ACT Electoral Commission.

Publishing on opax.com.au is exactly the "publish / distribute" case that needs
written permission. "Creative Commons" does not appear on the page. The 8,207
rows stay loaded for internal analysis; **no `money.act.json` in the repo.**

**NT -- RESTRICTED, gated.** NTEC has no copyright page of its own; its footer
points at <https://nt.gov.au/page/copyright-disclaimer-and-privacy>:

> No part of this website may be reproduced or reused for any purpose
> whatsoever, apart from: fair dealing for the purposes of private study,
> research, criticism or review, as permitted under the Act or where expressly
> provided under a Creative Commons licence.

Creative Commons applies only where an item is expressly marked, and the
financial-disclosure pages carry no such marking -- only "© 2026 NT Electoral
Commission". Because ntec.nt.gov.au 403s non-browser clients, both the returns
and these statements were read from Internet Archive captures
(`https://web.archive.org/web/20260901id_/https://ntec.nt.gov.au/financial-disclosure/`).
The 2,266 rows stay loaded; **no `money.nt.json` in the repo.**

To pull a research copy of a gated jurisdiction:

```
ssh desktop python3 - act --gated < scripts/export_state_money.py > /tmp/money.act.json
ssh desktop python3 - nt  --gated < scripts/export_state_money.py > /tmp/money.nt.json
```

#### What each small jurisdiction actually publishes

**Tasmania.** The Electoral Disclosure and Funding Act 2023 commenced **1 July
2025**, so this is a genuinely short series -- there is no pre-2025 Tasmanian
donation record to miss. Reportable political donations are $1,000 or more
(single or aggregated in a financial year), disclosed monthly outside an
election period and within 7 days during one. The TEC publishes them in two
places and the portal alone is a small slice: 11 rows are in the TEC Disclosures
portal, which launched 3 July 2026 ("From 3 July, all new electoral participant
registrations and reportable political donation disclosures will be published to
TEC Disclosures"), while the pre-portal record -- and the seven-day reports for
the July 2025 House of Assembly election and the May 2026 Legislative Council
elections -- live as report tables on the main site. Reading only the portal
gives 11 rows; reading both gives **264**. The two are de-duplicated on
(date, amount, donor, recipient), portal row winning; 3 rows overlapped.

*Not read:* the election campaign returns report
(`registers-and-reports/returns/`), which publishes each participant's return as
a PDF form plus an XLSX detail workbook. Those itemise the same reportable
donations already in the seven-day reports for the campaign period, so parsing
them would double-count; what they add is electoral **expenditure**, which
`ext_donations` does not model.

**ACT.** Gift returns run 2012-13 to 2026-27, one HTML page per financial year,
a table per recipient. Rows are individual gifts making up a $1,000+ aggregate,
so many single rows are small (the CFMEU's 333 ACT rows average about $390).
Recipient names print people as "Surname, Given", which the shared
`classify_donor_type()` calls 'other'; `money_small_jurisdictions.finish()`
re-labels those as individuals.

**NT.** Every NT row is **undated** -- the annual-return gift tables give a
financial year and no gift date, so `date_made`/`date_received` are NULL for all
2,266 rows and `financial_year` is the only time key. Two further NT quirks:

* Election returns republish gifts that are already in the annual returns (307
  of 879 election rows repeat a non-election row donor-for-dollar), so the
  export drops election-tagged rows entirely (`drop_election_rows`).
* 209 rows carry the literal recipient `Political Parties` -- a section heading
  in the 2014-15 donor-side returns that the table parser read as a recipient.
  They have no `recipient_party`, so the export already excludes them; worth
  fixing if NT is ever ungated.

### 1.2 IPEA parliamentarian expenditure -> `ext_expenses`

| Item | Detail |
|---|---|
| Endpoint | data.gov.au CKAN: `package_search?q=organization:ipea`; each quarter is a dataset with `YYYYqNN_dataextract[_transactional].csv` plus repayments / certifications / office-costs-by-state / adjustments CSVs (only the transaction file is loaded) |
| Format | CSV, ~25-46K rows / 6-13 MB per quarter; columns incl. `UniqueId, ReportingPeriodId, FullNameWithTitle, Surname, FirstName, Party, StateOrTerritory, Electorate, Role, UserFirstName/UserSurname (traveller), HighLevelCategory, MajorSubCategory, MinorSubCategory, FromDate, ToDate, NumberNights, NightlyRate, Description, From/ToLocation, Amount, TripSequence, LegNumber, ReasonForTravel, PublishableNotes` |
| Licence | **CC BY 3.0 AU** (`license_id: cc-by`, `license_title: Creative Commons Attribution 3.0 Australia` on the data.gov.au datasets; the CC BY 4.0 notice on ipea.gov.au covers the website, not the data) |
| Coverage | 37 quarters, 2017Q02 (1 Apr 2017) to 2026Q02 (30 Jun 2026); the 2024 quarters tag their resources `.CSV` (leading dot), which the discovery filter now tolerates |
| Cadence | quarterly, ~5-6 weeks after quarter end (2026Q02 published 2026-08-10) |
| Pulled | **1,229,512 rows, $1,352.1m**; 708 distinct parliamentarians; `person_id` linked for 1,217,845 rows (99.1%) via `members` first+last name |

Schema keeps IPEA's tree (`category_high/major/minor`) and adds the OPAX `category` via
`parli.ingest.ipea_expenses.map_category`, the traveller (family/staff differ from the
member), `unique_id` (stable across re-publications), `person_id`, `source_url` (the
dataset page). Loads replace per `(source, reporting_period_id)`. The legacy
`mp_expenses` (2.47M rows incl. the pre-2017 `icacpls` scrape) is untouched.

### 1.3 Ministerial diaries -> `ext_ministerial_meetings`

| Jurisdiction | Endpoint | Format | Licence | Coverage | Cadence | Status |
|---|---|---|---|---|---|---|
| **NSW** Cabinet Office ministers' diary disclosures | index `https://www.nsw.gov.au/departments-and-agencies/cabinet-office/access-to-information/ministers-diary-disclosures` -> one page per year -> one PDF per minister per quarter | PDF table `Date | Organisation/Individual | Purpose of Meeting`; some ministers also list `Lobbyist: <firm>, <person>` lines | **CC BY 4.0** (nsw.gov.au copyright statement) | 2019 Q1 to 2026 Q2 online (scheme began 2014; earlier years not on the site) | quarterly, ~1 month after quarter end | **pulled: 719 PDFs, 25,606 meetings (99.7% dated)** |
| **QLD** Cabinet and Ministerial Directory | `https://cabinet.qld.gov.au/ministers-portfolios.aspx` -> minister page -> one PDF per month (`/assets/diary/YYYY/month/slug.pdf`) | PDF table `Date | Organisation/Individual | Purpose` with a title block (Hon X MP, portfolios, period) | CC BY (cabinet.qld.gov.au copyright notice) | current government Nov 2024 to Jul 2026 (29 ministers/assistant ministers); former governments 2013-2024 available via `--period 2020-2024` etc. (not pulled) | monthly, end of following month | **pulled: 612 PDFs, 35,893 meetings (99.96% dated)** |
| VIC, WA, SA, TAS, federal | no published ministerial diary regime (VIC and federal publish nothing; WA/SA publish nothing systematic) | | | | | n/a |

Schema: `jurisdiction, source, minister_name, minister_title, portfolio, government_period,
period_start/end/label, meeting_date, meeting_date_raw, organisation (first line of the
cell), attendees (whole cell), lobbyist (NSW "Lobbyist:" lines), purpose, source_url,
pdf_page, row_order, ingested_at`. Loads replace per `(source, source_url)` so a re-run of
one quarter never disturbs the rest. PDFs are cached under `~/.cache/autoresearch/ext_money/diaries/`,
so re-parses are offline.

### 1.4 Lobbyist registers -> `ext_lobbyists` / `_clients` / `_people` / `_contacts`

| Jurisdiction | Endpoint | Format | Licence | Pulled |
|---|---|---|---|---|
| **Federal** AGD Register of Lobbyists | JSON API behind the SPA: `POST https://api.lobbyists.ag.gov.au/search/organisations`, `GET .../search/organisations/{id}/profile` (reuses `parli.ingest.federal_lobbyists` helpers) | JSON | **CC BY 4.0** | 696 orgs (359 active, 337 deregistered), 2,634 client links, 715 lobbyists (296 flagged former government representatives) |
| **NSW** Electoral Commission register | `https://lobbyists.elections.nsw.gov.au/` server-renders Active/Inactive/Cancelled/Suspended tables; clients, employees, owners via the page's Visualforce AJAX postback | HTML | listed on data.nsw.gov.au as CC BY-SA 3.0 AU (verify); robots `ai-train=no` | 463 entities (190 active, 216 inactive, 55 cancelled, 2 suspended), 5,801 client links, 2,924 people (1,744 employees, 1,180 owners) |
| **QLD** Integrity Commissioner Lobbying Register | Power Pages entity lists `dpc_lobbyist`, `dpc_client`, `dpc_contactlog` via `/_services/entity-grid-data.json` | JSON grid | **CC BY 4.0** | 224 entities, 239 lobbyists (38 former senior govt reps), 2,445 client links (627 from the client list, 1,818 inferred from the contact log), **8,235 lobbying contacts** 2016-09 to 2026-09 -- the only jurisdiction publishing lobbying *activity* |
| **VIC** VPSC register | `https://www.lobbyists.vic.gov.au/sitemap.xml` -> 247 `/search-the-register/{slug}` pages (content is inside `<template>` elements, unwrapped before parsing) | HTML | **CC BY 4.0** | 247 entities, 1,386 client links (1,334 current), 682 people (467 employees, 323 with a former-government-representative description; 215 owners) |
| **SA** DPC register | SPA `https://www.lobbyists.sa.gov.au/` backed by `https://saglobbyistapi02prdaue.azurewebsites.net/api/{lobbyist, client?lobbyistId=, employee?lobbyistId=}` (anonymous GET) | JSON | not stated on the register (SA Government default CC BY) | 187 entities (127 active, 60 surrendered), 1,925 client links (651 active), 910 employees (9 with restrictions) |
| **WA** Public Sector Commission register | `https://www.lobbyists.wa.gov.au/` embeds the whole register in the home-page script (`gridData.push`, per-company pushes); one fetch per run | HTML/JS | Crown copyright; wa.gov.au terms discourage automated access | 126 companies, 731 client links, 473 people (282 lobbyists, 191 owners) |
| TAS, ACT, NT | TAS (DPAC, ~30 entries) and ACT/NT registers are small HTML lists; not pulled | | | follow-up if wanted |

342 ABNs appear in more than one register; the most widely represented clients
(DoorDash, Bunnings, Mars, Optus, Rio Tinto, IFM Investors, Eli Lilly ...) are on all six.

### 1.5 AEC Transparency Register: debts, benefits, return totals -> `ext_aec_debts` / `ext_aec_benefits` / `ext_aec_returns`

`parli.ingest.donations` loads the register's receipts and donations into `donations`
and stops there. Three more things the same bundle carries, loaded 2026-09-02 by
`parli/ingest/money_aec_extras.py` (run on `desktop`, `--db` local mode, one transaction
per table):

| Item | Detail |
|---|---|
| Endpoint | `https://transparency.aec.gov.au/Download/AllAnnualData` -- one ZIP (~2.5 MB) of the annual-return CSVs. Fetched **once** and cached at `~/.cache/autoresearch/aec/AllAnnualData.zip` (2026-09-02); `--refresh` re-downloads. `AllElectionsData` / `AllReferendumData` sit beside it but are not used here |
| Licence | **CC BY 4.0.** "Unless otherwise noted, the AEC has applied the Creative Commons Attribution 4.0 International Licence to all material on this website with the exception of the Commonwealth Coat of Arms, AEC's logos, AEC's maps and content supplied by third parties" -- https://www.aec.gov.au/footer/Copyright.htm (confirmed 2026-09-02). The register is an AEC site; attribution: *Australian Electoral Commission, Transparency Register* |
| Files used | `Detailed Debts.csv` (14,680 rows), `Detailed Discretionary Benefits.csv` (857), `Capital Contributions.csv` (245), `Party Returns.csv` (2,229), `Associated Entity Returns.csv` (4,363), `Significant Third Party Returns.csv` (277, incl. the pre-2022 *Political Campaigner Return* rows), `Third Party Returns.csv` (747), `Donor Returns.csv` (13,315), `MemberOfParliamentReturns.csv` (52); `Detailed Receipts.csv` is read only to sum its *Receipt Type* per return |
| Not loaded | receipts themselves (already `donations`); election / referendum bundles; `Media Returns` |

Tables (all carry `source='aec_annual'`, `source_file`, `source_url`, `ingested_at`; loads
replace per source):

- **`ext_aec_debts`** -- one row per creditor a lodger itemised: `financial_year, return_type`
  (the register's own name: *Political Party Return* 4,587 / *Associated Entity Return* 8,172 /
  *Significant Third Party Return* 1,251 / *Political Campaigner Return* 670), `kind` (OPAX
  bucket), `recipient` (the debtor), `recipient_canonical` (party bucket, **party returns
  only**), `associated_party` + `associated_party_canonical` (for associated entities, from
  the AssociatedParties field of the entity's own return; 7,283 of 8,172 resolve),
  `lender_name`, `amount` (balance owed at 30 June), `lender_type` (*Financial* 721 /
  *Non-financial* 13,959 -- the register's flag).
- **`ext_aec_benefits`** -- `benefit_type` = `discretionary_benefit` (857; government payments
  other than public election funding, itemised from 2018-19; `date` where given, 125 blank)
  or `capital_contribution` (245; capital put into associated entities, 2000-01 on). Same
  recipient / party columns as debts plus `provider_name`. Both categories are *also* in
  `donations` as undifferentiated `aec_annual` rows (that loader treats every annual CSV as a
  donation); here they keep their category. Do not add the two tables.
- **`ext_aec_returns`** -- one row per lodged return with the lodger's own headline totals:
  `kind` party 2,229 (274 distinct names) / associated_entity 4,363 (488) /
  significant_third_party 213 (65) / political_campaigner 64 (24) / third_party 747 (240) /
  donor 13,315 (7,151) / member_of_parliament 52 (30); `total_receipts, total_payments,
  total_debts, total_benefits, total_capital_contributions, electoral_expenditure,
  total_donations_made, total_donations_received, donor_count`, plus `party_group`,
  `associated_parties`, `lodged_on_behalf_of`, `abn`, `client_file_id`, `client_type`. The
  `itemised_donations / _other_receipts / _subscriptions / _public_funding / _unspecified`
  columns sum `Detailed Receipts` by its *Receipt Type* for the same return (1,265 of 2,229
  party returns have itemised lines), so a party's income splits without re-loading
  receipts; they cover only lines above the threshold and sum to less than `total_receipts`.

Party canonicalisation reuses `ext_common.canonical_party` (the money map's grammar) with
three guards decided first: *Democratic Labor*, *Liberal Democrat* and *Libertarian* stay
unbucketed (the shared grammar would file them under Labor / Liberal; `donations` leaves them
NULL too), and *Country Liberal* / *Centre Alliance* map to their money-map node names (the
shared list tests `liberal` before `country liberal` and has no Centre Alliance rule). Every
party node in `graph/money.json` now has a matching key in the export.

Headline figures 2024-25 (party returns, all branches summed; balances at 30 June 2025):
Liberal $8.10m owed to 30 creditors (Atomic 212 $2.99m, Bunori $1.42m, Vapold $1.0m,
Liberal Properties $0.90m, Google $0.36m); Nationals $2.43m (Westpac $1.5m and NAB $0.18m are
the only bank loans of size among the majors; National Building Foundation $0.36m); Greens
$1.19m (Google $0.27m, Dept of Finance $0.20m, ATO $0.15m); LNP $0.92m (Atomic 212 $0.44m);
Labor $0.83m across 21 creditors (Message4U $0.13m, ATO $0.10m); One Nation $0.63m
(Stepmates Studios $0.16m, Westpac $0.10m). Lifetime (2000-01 to 2024-25) party-return debt
balances: Liberal $299.5m, Labor $190.3m, Nationals $46.9m, Greens $20.4m, UAP $20.3m.

## 2. Industry classification of state donors (`money_classify.py`)

Three tiers over `ext_donations` rows with `industry IS NULL`, each recorded in
`industry_source`:

1. **keyword** -- `INDUSTRY_KEYWORDS` from `classify_donations.py` (first industry in
   table order wins; identical to the AEC SQL pass). The table gained unambiguous terms
   the state data surfaced: `united voice`, `employees association`, `shop distributive`,
   `together queensland` (unions); `j.j. richards` (waste); `appea`, `senex energy`,
   `arrow energy`, `qgc` (fossil fuels); `clubs queensland`, `keno`, `lottery corporation`
   (gambling); `govstrat`, `sas consulting group` (lobbying); `watpac`, `builders`,
   `constructions`, `urban development institute` (property). `classify_donor_name()` was
   added for single-name use; `anthropic` became a lazy import so the module loads
   without the SDK. The AEC pass itself has **not** been re-run (it would relabel AEC
   rows; run `classify_donations` when that is wanted).
2. **individual** -- `donor_type = 'individual'`.
3. **aec_match** -- exact case-insensitive name match against the AEC `donations` table,
   inheriting the most common non-`other` industry (zero conflicting names measured).

Result (2026-09-02): keyword 786 new + 6,159 at ingest = **6,945**; individual **21,244**;
aec_match **1,933**; **5,608 rows / 3,032 donor names remain NULL** = the LLM-pass
candidate set. Top candidates by dollars: Sporting Shooters Assn (QLD) $456K, Apex Outdoor
$217K, St Baker Energy Innovation Trust $172K, QER Pty Ltd $141K, Firearm Dealers
Association $137K, Coogee Chemicals $116K ... -- mostly QLD/WA company names no keyword
knows, plus a firearms lobby that has no industry bucket in the taxonomy (consider adding
`firearms`). **LLM pass = user's cost decision**: ~3,032 names at 100 per call is ~31
Haiku-class calls, well under a dollar; `python -m parli.ingest.money_classify --report`
lists them.

## 3. Data-quality notes

Donations
- WA dates are m/d/yyyy in the grid (verified against 27 Aug 2026 disclosures); QLD gives
  `date_made` only, WA `date_received` only, VIC both.
- WA "compulsory party levy" rows are MPs paying their own party (donor = sitting member);
  they carry `disclosure_type='compulsory party levy'` and should be excluded from
  donor rankings. QLD `is_political_donation` = 0 rows are receipts that are gifts but not
  political donations under the Act (keep the flag visible).
- Recipient strings are as disclosed ("Australian Labor Party (State of Queensland)",
  "WA Labor", "AUSTRALIAN LABOR PARTY - VICTORIAN BRANCH"); `recipient_party` canonicalises
  them (LNP tested before Labor/Liberal). 1,950 rows ($13.0m) have no party bucket:
  candidates, committees, independents.
- Same donor, different spellings across sources ("J.J. RICHARDS & SONS PTY LTD" vs "J.J.
  Richards & Sons Pty Ltd"): only case-folding is applied; reuse `export_money_graph.norm_key`
  (suffix stripping) when aggregating.
- **Do not add state and federal totals.** AEC annual returns of federally registered
  parties include their state branches' receipts, so a QLD gift to the LNP can appear in
  both `donations` and `ext_donations`. Jurisdiction is a filter, never a union.

Expenses
- 18 of 708 members are unlinked to `members.person_id` (nickname/case mismatches: "Pat"
  vs "Patrick Conaghan", "Bob" vs "Robert Hawke"; former PMs and one senator absent from
  `members`). `members` is dirty (see MIGRATION-ARAG.md), so treat `person_id` joins as
  best-effort and prefer `member_name` for display.
- IPEA re-publishes quarters (2022Q02-2023Q02 were re-issued in 2026); `unique_id` is the
  stable key and the per-quarter replace absorbs re-publication. Negative amounts are
  IPEA adjustments/repayments and are kept as published.
- `role` is empty for 623,587 rows (older quarters did not publish it).

Diaries
- PDF headers are inconsistent: NSW names the **office**, not the minister; a surname is
  recovered from the file name where it carries one (`minister-catley-...`, `Minister
  Jackson - Diary Disclosure ...`): 8,788 of 25,606 NSW rows, 21 ministers. Two-line and
  overprinted headings, five date styles (`1.10.2025`, `1/10/25`, `1 October 2025`,
  `1st October 2025`, year-less `4 February`) and period lines with the year only on the
  end date -- all handled; year-less dates take the diary period's year. 906 rows (NSW 554,
  QLD 352) still have no parsed period; 52 NSW rows carry only a year label.
- QLD minister names are as published, so nickname variants coexist ("Dan Purdie" /
  "Daniel Purdie", "Samuel (Sam) O'Connor"); honorifics and post-nominals are stripped.
- Source typos: a meeting dated year 2926, a 2005 date inside a 2025 diary -- `meeting_date`
  is nulled when outside the diary period +/- 1 year (`meeting_date_raw` keeps the text).
- QLD links one 2013 Newman-era diary (Ros Bates) from her current page; it is loaded with
  its true period. The same PDF linked from two minister pages is now loaded once.
- 29 NSW PDFs yield no rows: they are the 22-31 December 2021 stub diaries issued after
  the Perrottet reshuffle and read "Nil return". No NSW or QLD PDF failed to parse.
- Attendee cells hold several names/roles per meeting; `organisation` = first line,
  `attendees` = whole cell, `lobbyist` = NSW "Lobbyist: ..." lines (113 rows; the
  convention is recent and minister-specific, so absence is not evidence of no lobbyist).
  NSW also prints "Minister X" / "Y MLC" lines for other members present -- left in
  `attendees`.
- The legacy `ministerial_meetings` (3,237 QLD rows, header strings mis-parsed as dates)
  is superseded and untouched.

Lobbyists
- VIC's former-representative flag is broad by design (it includes former ministerial
  advisers, so 69% of employees carry it); federal (41%) and QLD (16%) use narrower tests.
  Not comparable across jurisdictions.
- NSW "On Watchlist?" is blank for every entry (no one listed), so `on_watchlist = 0`
  everywhere; the NSW detail postback occasionally fails for a firm (logged, firm kept
  without clients).
- QLD publishes no ABNs; QLD client links from the contact log are inferred (`derived_from
  = 'contact_log'`) and only carry a first-seen date. 4,087 of 8,235 contacts have no
  `contact_mode`.
- SA `client.active` is derived from a missing end date; WA has no status/dates beyond
  `lastUpdated`.

AEC extras (§1.5)
- A "debt" is whatever the lodger listed as owed at 30 June to one creditor above the
  threshold: bank loans, trade creditors (ad agencies, SMS vendors, venues), the ATO and
  Department of Finance advances all appear. `lender_type='Financial'` is the register's own
  flag and is the only way to isolate loans; a balance is not new borrowing, and a year with
  nothing itemised is not a year with no debt.
- Names are as disclosed and HTML-escaped in the CSV (`&amp;`); the loader unescapes. The
  same creditor recurs under spellings ("Dept Finance", "Department of Finance", "ATO",
  "Australian Taxation Office (ATO)"); the export aggregates with `norm_key` only.
- Financial years arrive as `2000-2001` in older files and `2024-25` in newer ones; the loader
  normalises to `2000-01`. `Political Campaigner Return` is the 2018-19 to 2021-22 name of
  what is now a `Significant Third Party Return`; `kind` keeps them apart, `return_type`
  keeps the register's word. `Third Party Returns.csv` carries a `ClientType` that is the
  lodger's *current* class (258 of 747 rows are entities now registered as associated
  entities), stored as `client_type`.
- Party totals sum every branch lodging under the party's name; the federal secretariat and
  each state branch are separate returns, and the money map's rule against adding state and
  federal *donation* totals does not apply to these branch sums (they are one register).

## 4. Exposure design (money stays relational / static JSON)

Per MIGRATION-ARAG.md, structured money stays out of the KB; the portal reads static JSON
under `portal/public/graph/`. Proposed additions, in value order:

1. **Money map by jurisdiction. Shipped 2026-09-02 (QLD, VIC); see §4.1.**
   `scripts/export_state_money.py {qld|vic|wa}` reads `ext_donations` with the federal
   export's rules (`recipient_party` -> party nodes; `norm_key` on donors; public funding and
   party-internal exclusions) and writes `graph/money.qld.json` / `money.vic.json` in the
   **same node/edge shape** plus a `meta` block (`jurisdiction, commission, sourceShort,
   licence, coverage, threshold, not_summed`). Files are separate on purpose (no
   cross-jurisdiction sums, see §3). WA stays behind the licence gate: the script refuses
   `wa` without `--gated`, and nothing WA is served.
2. **Expenses on person pages** (`#/subject/person/{name}`). Export
   `graph/expenses/index.json` (per member: latest four quarters, lifetime total, rank) and
   `graph/expenses/{slug}.json` (quarter x category totals, top descriptions, member vs
   family/staff traveller split), keyed by the same normalised speaker name the person page
   uses (`speakers.json`), joined via `members.person_id` with a name fallback. Render as an
   "Expenses (IPEA)" infobox line + category bar list + link to the data.gov.au dataset.
   Federal members only; state MPs show nothing rather than a wrong zero.
3. **Meetings on person pages** for NSW/QLD ministers (they are in the corpus via NSW
   Hansard / QLD parliament): `graph/meetings/{slug}.json` with organisation counts and the
   raw list, plus the `lobbyist` field. Also a donor-page section "Met ministers" by
   organisation-name match against `ext_ministerial_meetings.organisation` (the
   money <-> access join).
4. **Donor pages**: "Also disclosed to state commissions" (per-jurisdiction totals from
   `ext_donations`) and "Registered lobbying client of" (`ext_lobbyist_clients` by client
   name) -- the money <-> lobbying join. One `graph/donors.json` for the top-N donors
   keeps it static.
5. **Lobbying graph** (`graph/lobbying.json`): firms <-> clients on the existing 3D engine,
   with per-register presence and the QLD contact time series as a small chart.
6. **KB ingestion (user's cost decision, not started):** the 62K diary meetings and 8K QLD
   contacts are short text rows (~2-3M tokens total) and would make "who met the gambling
   lobby in 2025" answerable through /ask with citations back to the PDF URL. It is paid
   processing on the platform; cost it from the step-4 sample before enabling. Donations,
   expenses and registers should **not** go into the KB -- they are tables.

### 4.1 State donations on the portal (shipped 2026-09-02)

Files (`portal/public/graph/`, static, committed):

| File | Size | Rows used | Donors | Parties | Edges | Top donors |
|---|---:|---:|---:|---:|---:|---|
| `money.qld.json` | ~98 KB | 22,703 gifts to parties (of 23,618) | 250 | 10 | 369 | Mineralogy $3.78m; Duncan Turpie $1.33m; United Voice QLD $829k; J.J. Richards & Sons $794k; CEPU Electrical Division QLD/NT $781k; CPSU PSU Group $768k; United Workers Union $745k; AWU QLD $643k; AMWU $497k; Pharmacy Guild QLD $430k |
| `money.vic.json` | ~82 KB | 3,416 donations to parties (of 4,237) | 250 | 11 | 291 | Jason McClintock $110k; Malik Zaveer $70k; Darren Natale $55k; Lucas Moon $48k; Peter Walsh $48k; Louise Staley $47k; Tim Read $42k; Matt Fregon $40k; Richard Welch $38k; Victorian Automotive Chamber of Commerce $24k |
| `money.tas.json` | ~55 KB | 220 gifts to parties (of 264) | 168 | 5 | 173 | NEX Building Group $44.7k; Electrical Trades Union Victoria $40k; Plumbing and Pipe Trades Employees Union Federal Office $30k; Pharmacy Guild of Australia Tas Branch $26.2k; SDA Tasmanian Branch $23.2k; Google Australia $22k; Health Services Union Tas Branch $19.9k; Encompass Health Holdings $16.5k; AWU Tasmanian Branch $15.7k; Hospitality Tasmania $14.8k |
| `money.wa.json` | not generated for the portal | | | | | **WA is excluded from public exposure**: WAEC asserts full Crown copyright with no open licence. `export_state_money.py wa --gated` produces a research copy outside `portal/public`. |
| `money.act.json` | not generated for the portal | | | | | **ACT is excluded**: no open licence, permission required to publish or distribute (section 1.1). `export_state_money.py act --gated` for a research copy. |
| `money.nt.json` | not generated for the portal | | | | | **NT is excluded**: no open licence, all-rights-reserved NT Government statement (section 1.1). `export_state_money.py nt --gated` for a research copy. |

Rules on top of the federal export: gifts to candidates, committees and third parties
are out (no `recipient_party`); the other/NULL-industry floor is per jurisdiction (QLD
$100k, VIC $10k, WA $50k, TAS $1k, ACT/NT $10k; the federal $5m would empty a state file,
and TAS's whole register is only $1.5m); VIC and TAS `loan` rows and WA
`compulsory party levy` rows are dropped as not-gifts; NT `receipt` rows (pre-2020-21
annual returns list receipts of any kind, including public funding) and NT election-return
rows (which repeat the annual returns) are dropped.

Tasmania's file is small on purpose -- 220 usable rows over two financial years -- because
the scheme itself only started on 1 July 2025. The map and ledger carry that in
`meta.threshold` and the front-page caption says it in words, so a thin map reads as a
young disclosure regime rather than a broken export. QLD keeps every gift and reports the
`is_political_donation` split in `meta.political_donation_flag` (the flag only exists from
2022-23: 2,449 flagged political donations, 5,123 gifts the Act does not class as political
donations, 15,131 unflagged older rows). VIC's top disclosed donors are mostly individuals
and many are sitting MPs paying their own party (the register does not tag these the way WA
tags its levy); they are shown as disclosed.

Where it appears:

- `#/money` gets a Jurisdiction switch (Federal, Queensland, Victoria, Tasmania) above the map; the
  choice deep-links as `#/money?jur=qld` and defaults to Federal. Switching destroys and
  remounts the 3D map on the matching file; the ask and search triggers on the cards are
  unchanged. `/map?jur=qld` does the same on the full-screen page. The map hint reads
  `meta.sourceShort` ("ECQ gifts register 2012-13 to 2026-27") instead of "AEC returns".
- The Ledger (`ledger.js`) has the same switch; filters survive a switch only if the new
  file offers the same industry/party. The fineprint, the Raw data link and the CSV comment
  header are built from the loaded file's `meta` (commission, coverage, threshold, licence).
- Donor pages (`#/subject/donor/...`) get "Also disclosed to state commissions": one row per
  state file the donor appears in (jurisdiction, total, gift count, years, recipient parties)
  linking to that jurisdiction's map; exact match after `normName` (case and company
  suffixes), so "Mineralogy" (AEC) and "Mineralogy Pty Ltd" (ECQ) meet, spelling variants do
  not. Also rendered for donors outside the federal top 250.
- **Money & Words and Words per dollar stay federal.** They pair AEC industry totals with
  the speech index; adding state files would require a per-jurisdiction words series and
  would invite the sum the fineprint forbids. Left as-is on purpose.

- The **state map** on the front page (`statemap.js`, `MONEY_FILES`) offers "State donations"
  in a state's popover. Tasmania has no parliament in the corpus, so its shape stays dimmed
  and its popover offers the donations link *without* a "Search this parliament" link -- the
  one behavioural change to `show()`. The ACT and the NT have no shape on that map at all
  and are gated anyway, so neither is listed there or in the caption under it.
- **Still hardcoded, not wired:** the "Disclosures" / "Disclosed to" commission filters on
  the Parties and Donors directories (`app.js`, `buildPartiesDirectory` and
  `buildDonorsDirectory`) load `federal`, `qld`, `vic` by name -- a `Promise.all`
  destructure, a `files` array, a `sourceShort` map and two `options` arrays each. Tasmania
  will not appear in those two directories until that is made data-driven off
  `MONEY_JURISDICTIONS`. Donor *entry* pages (`renderDonorStateMoney`) already iterate
  `MONEY_JURISDICTIONS`, so Tasmania shows up there with no change.

Fineprint everywhere (map panel, ledger, donor section, CSV header) names the commission
as source, states the disclosure-threshold floor ("totals are a floor, not a ceiling") and
carries: *State and federal returns are not summed: AEC returns already include state
branch receipts.*

### 4.2 AEC debts, benefits and the third-party roster (built 2026-09-02)

`scripts/export_aec_extras.py` (run `ssh desktop python3 - < scripts/export_aec_extras.py >
portal/public/graph/aec-extras.json`) writes one static file, **~235 KB raw / ~61 KB gzipped**:

- `meta` -- source, licence (CC BY 4.0 + URL), coverage per table, `latest_year`, the
  column names of every compact year array, caps, counts, and the caveats above as
  sentences.
- `parties["<money-map label>"]` (16 keys, every `money.json` party among them) --
  `returns` (per year: receipts, payments, debts, branches, itemised donations / other
  receipts / public funding), `debts` (latest year with itemised debts: total, financial-
  institution total, creditor count, top 12 creditors aggregated across branches with the
  branches named, and a per-year series), `benefits` (latest year's discretionary benefits,
  top 8 providers, per-year series), `associated_entities` (top 12 by receipts on their
  latest return, out of `associated_entities_total`).
- `entities` -- the roster: 290 of 701 distinct associated entities, significant third
  parties, political campaigners and third parties (caps 150 / 150 / 150 / 80 per kind,
  $100k floor on peak annual receipts or expenditure), each with the register's return
  types, ABN, canonical associated parties and a per-year series of its own headline totals
  (receipts, payments, debts, electoral expenditure, gifts received). Donor and MP returns
  are not exported (donors have the money map).

Where it appears: the party entry page (`openSubject`, party branch) gains **"Debts and
other funding"** after "Where it came from": three tiles (owed at 30 June, of it to financial
institutions, creditors listed), a bar list of the largest creditors in the latest year with
"(financial institution)" on the register's flagged ones, a column chart of the year-end
balance series, one sentence on discretionary benefits, and the six largest associated
entities linking to a record search (not to donor pages: entity resolution there is another
agent's). The infobox gains "Debts at 30 June YYYY". The fineprint says balances, not
borrowing; trade creditors and tax beside loans; threshold; source and licence, with a link
to the register. Donor index and donor pages: nothing yet (the roster is in the JSON for
whoever builds it). Third-party / associated-entity pages: not built; the data is there.

## 5. Runbook

`uv run` fails on this Mac (the lock pins a CUDA torch wheel), so use the worktree venv
directly: `uv pip install --python .venv/bin/python requests beautifulsoup4 lxml pdfplumber`
once, then `PYTHONPATH=. .venv/bin/python -m parli.ingest.<module>`. Writers default to
`ssh desktop`; `--db /tmp/x.db` for a local test file, `--dry-run` to fetch without writing.

| Refresh | Command | Cadence |
|---|---|---|
| State donations | `money_state_donations` (QLD/VIC/WA; `--source qld` etc.) | weekly |
| Small-jurisdiction donations | `money_small_jurisdictions` (TAS/ACT/NT; `--source tas` etc.) | weekly for TAS (7-day disclosures), annually for ACT/NT |
| IPEA | `money_ipea --since 2026q03` | quarterly, mid Aug/Nov/Feb/May |
| NSW diaries | `money_diaries --jurisdiction nsw --years 2026` | quarterly |
| QLD diaries | `money_diaries --jurisdiction qld` (current govt; `--period 2020-2024` for former) | monthly |
| Lobbyists | `money_lobbyists` (all six, ~25 min; `--jurisdiction qld` alone for the contact log) | monthly |
| Classification | `money_classify --report` after any donation load | with donations |
| State money maps | `ssh desktop python3 - qld < scripts/export_state_money.py > portal/public/graph/money.qld.json` (and `vic`, `tas`); then from `portal/`: `node graph/smoke-test.mjs`. WA/ACT/NT refuse without `--gated` and must not land under `portal/public/` | after a state donation load |
| AEC extras | on desktop: `PYTHONPATH=. .venv/bin/python -m parli.ingest.money_aec_extras --refresh --db ~/.cache/autoresearch/parli.db` (~10 s; `--table debts` etc. for one), then `ssh desktop python3 - < scripts/export_aec_extras.py > portal/public/graph/aec-extras.json` | yearly, after the AEC's early-February release of annual returns; the bundle is one fetch |

Run-time 2026-09-02 (laptop, polite delays): donations ~5 min, IPEA ~35 min (37 CSV
downloads), NSW diaries ~40 min (633 PDFs), QLD diaries ~25 min (611 PDFs), lobbyists
~25 min total. Two loaders writing the same table concurrently is safe (remote temp
files are now unique; SQLite serialises with a 600 s busy timeout).

## 6. Open items

- NSW donations: request a bulk extract from the NSW Electoral Commission (their terms
  bar scraping; they email copies on request).
- WA donations: clear the WAEC copyright position before any public exposure.
- Optional LLM pass over the 3,032 unclassified state donors (`--report` lists them);
  consider a `firearms` industry bucket.
- QLD former-government diaries (2013-2024) are one flag away (`--period`), ~4x the current
  volume; TAS/ACT/NT lobbyist registers are small HTML lists.
- Re-run the AEC keyword pass (`classify_donations`) so federal rows pick up the new
  keywords.
