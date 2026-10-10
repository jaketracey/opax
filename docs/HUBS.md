# Sitting weeks and Senate estimates

## Victorian election 2026

`/vic-election-2026` and its 96 constituency pages are behind
`VIC_ELECTION_HUB_ENABLED`. The shared default in `portal/public/vic-election.js`
is false; the deployment value is controlled separately in `portal/wrangler.jsonc`.
An absent value, `false`, `1`, or any string other than exact `"true"`
keeps publication disabled. Disabled pages, unknown constituencies and the
direct election facts asset return 404 with `X-Robots-Tag: noindex`; HTML 404s
also have a robots meta tag. The disabled gate runs before host or alias
redirects, including www, trailing slashes, case and encoded aliases for pages,
the election sitemap and facts asset. Disabled hubs have no election links,
sitemap entry or llms.txt entry.

The control hub approved the electoral authorisation and corrections contact on
10 October 2026. Every published Victorian hub page carries:

> Authorised by Jake Tracey, Noice Pty Ltd, Level 6, 343 Little Collins St, Melbourne VIC 3000.

The address was verified against [Noice's contact page](https://noice.net.au/contact/).
The footer links to `corrections@opax.com.au` and says “We aim to respond within
2 business days.” These values live in `portal/public/vic-election.js` and are
required for Victorian pages even when optional federal footer variables are
empty. The complete authorisation is also on landscape and portrait electoral
share cards and in the downloadable `/hubs/vic-election-2026.json` projection,
which includes the corrections contact and response wording. Print styles
retain the footer and keep its lines together. Enabling publication is a
separate change to `VIC_ELECTION_HUB_ENABLED`; the text change does not enable it.

For an **isolated local preview only**, run Wrangler with
`--var VIC_ELECTION_HUB_ENABLED:true` inside the required network namespace.
This does not change the checked-in default. With publication enabled, the
Worker adds `/sitemaps/vic-election-1.xml` to the generated sitemap index and
adds the election entry to `/llms.txt`. The separate `vic-election` sitemap type
contains the hub plus all 96 constituency pages, with dated lastmods. Discovery
is gated at request time by the same flag as SSR and canonical resolution;
the base generated crawl files always remain election-free. Published trailing
slashes redirect once to the canonical no-slash path, including www aliases.

`npm run build:search` finishes with `build:vic-election`. Its offline projection
uses the VEC source config in `scripts/hubs/vic-election-2026.json`, the exact
state electorate index, validated roster, existing canonical person-path table,
`votes.json` and Victorian division shards. It writes the uncommitted,
deployed `portal/public/hubs/vic-election-2026.json`; run the full search build
first to refresh canonical person paths. There is no new ingestion, identity
join, cron, candidate list or donor read. The projection uses an explicit field
allowlist. All 88 Assembly districts have one roster member and all 8 Council
regions have five, dated to the published roster snapshot.

The VEC's [district list](https://www.vec.vic.gov.au/electoral-boundaries/state-districts)
and [region list](https://www.vec.vic.gov.au/electoral-boundaries/state-regions)
were checked on 10 October 2026. The [VEC boundary review](https://www.vec.vic.gov.au/electoral-boundaries/state-boundary-reviews)
identifies October 2021 as the last state redivision, effective 1 November 2022.
The [EBC final report](https://www.ebc.vic.gov.au/Past-Redivisions/Default.html)
(paragraphs 476, 478 and 479) identifies the Buninyong/Eureka and Eastern
Metropolitan/North-Eastern Metropolitan name changes and nine abolished and
nine new district names. These changes predate this term; there is no 2025
state redivision identified by those sources. No spatial boundaries are copied
or approximated. Each region's 11-district membership uses its VEC page.

The [VEC legal terms](https://vec.vic.gov.au/legal) grant **CC BY 4.0 International**
for website material, excluding images, photographs, videos, branding (including
the VEC logo) and third-party content. The rendered attribution is **© Victorian
Electoral Commission**. Pages paraphrase facts and reproduce names, not maps,
imagery, VEC branding or third-party enrolment projections. The source config
records hashes of the checked pages and EBC report; local source copies are in
`portal/private/growth-vic/`.

The current [VEC timeline](https://www.vec.vic.gov.au/voting/types-of-elections/state-elections)
and [2026 election page](https://www.vec.vic.gov.au/voting/2026-state-election)
put nominations closing at **noon 9 November**, superseding the older draft
service plan's 13 November. The hub points to VEC candidate publication after
nominations close and carries no candidate names. Early voting is 18–27 November
(closed Sunday 22 November); election day is Saturday 28 November. Caretaker
starts at 6 pm 3 November unless Parliament is dissolved earlier, sourced to
the [Victorian caretaker guidelines](https://www.vic.gov.au/guidelines-caretaker-conventions/introduction).

Speech counts retain their exported years. Counts wholly within 2023–2026 are
available term records, without a completeness claim. Counts starting in 2022
cannot isolate the November election cutoff. Mixed federal/Victorian totals are
withheld, and members without a count show an explicit gap. Historical surname
aggregates are not merged. Victorian vote totals cover **2026 only**; their
participation counts can differ from the separately exported detailed division
pages. No division absence is inferred from a missing row. The five latest
available detailed divisions carry dates, recorded votes and original sources.
Victorian Hansard/divisions have restricted copyright, **no open licence**, as
recorded in `docs/COVERAGE.md`; only existing counts and links enter the hub.

There is no Victorian interests register or state grants export. Federal
electorates are different from state districts, so no federal grant allocation
is made. Every page states these gaps. “An association does not prove influence”
belongs alongside an actual money-and-politician pairing; the election hub has
no such records, so it does not display the line. The tests derive individual
donor labels with main's `isOrganisationDonor` classifier. A label coinciding
with a validated member name is permitted in that member's roster context;
donor identities, fields and links remain excluded.

The dated, per-constituency export audit and verification record are in
[VIC-ELECTION-2026.md](VIC-ELECTION-2026.md). Screenshots and local HTTP/DOM
checks at 390 and 1280 are retained privately in `portal/private/growth-vic/`.

The hub facts are rebuilt by `npm run build:search` (including `build:hubs`) from
the published bills, divisions, agency profiles and federal grant shards. The
Worker renders those facts at `/sitting`, `/sitting/<monday-date>` and
`/estimates/2026-10`. There is no network acquisition at build or serve time and
no new cron. The generated `portal/public/hubs/` directory is deployed, not
committed. Run `npm run build:search` before tests or a local preview.

`scripts/hubs/sitting-2026.json` also supplies the nightly bills guard's cadence.
`refresh_bills` marks the four remaining reviewed periods; the September archive
does not expand the refresh schedule. Houses govern which bills and divisions
enter each hub. A bill belongs to its introduction week, not every week in which
it has a later stage. Division titles prefer the 2D bill-export title, then the
division export's title/name/question. State divisions are excluded.
The source config links directly to APH's 2026 iCal and its sitting-calendar
page. The iCal was fetched on 10 October and confirms each of these periods
and both cut-off dates; its response hash is recorded in the config.

The sitemap's `hubs` type takes the latest introduced-bill or division date in
each sitting week, or the calendar's `updated` date when the week is empty. The
index takes the latest of its weeks. Estimates takes the latest of its config's
`updated` date and the contract and grant snapshot dates. Hub facts also enter
the existing IndexNow change journal. Published hub URLs with trailing slashes
use bet 1's canonical resolver and redirect in one 301 hop to the no-slash URL,
including combined host/path aliases; unknown periods remain noindex 404s.

## Correction contact

Victorian election pages use the approved corrections email and response wording
above. Federal sitting and estimates hubs retain their optional
`CORRECTION_CONTACT` and `AUTHORISATION_LINE` defaults in `portal/src/hubs.ts`;
configured links are validated and text is escaped. A bare `mailto:` address is
accepted alongside site paths and HTTPS URLs.

## Updating the October estimates program

On 10 October 2026 one request to APH's [Next hearings page](https://www.aph.gov.au/Parliamentary_Business/Senate_estimates/Next_hearings)
returned HTTP 200 using the Firefox user agent from `words_common.py`, as used by
`words_parlinfo.py`. All eight committees said programs were to be finalised.
The config records the response hash, date, URL and result. The local response
copy is in `portal/private/growth-hubs/aph-next-hearings.html`.

1. Fetch the APH page once with the same user agent. Stop if blocked. Record the
   checked date and published program URL; do not infer attendance from a
   portfolio allocation.
2. Edit `scripts/hubs/estimates-2026-10.json`. For each published committee,
   replace `program: null` with
   `{"source_url":"<official program URL>","agencies":["<exact agencies.json name>"]}`.
   Retain `null` for committees without published programs. Check any changed
   committee dates against APH, and update `groups`, `start` and `end` if needed.
3. Update `updated`, `published_status` and `fetch` to describe what was actually
   checked. Keep the portfolio fallback for unpublished committees. Add a
   published agency only if it has a matching agency export; the build rejects
   unknown names. Record an unavailable agency in the review report rather than
   inventing a financial row.
4. Run `cd portal && npm run build:search && node --test test/growth-hubs.test.mjs`,
   then the standard portal gates and inspect both viewport widths. Commit the
   config and source changes for review; follow the normal release process.

## Portfolio and financial coverage

The fallback maps primary bodies from the [Australian Government Organisations
Register](https://www.directory.gov.au/reports/australian-government-organisations-register),
checked 10 October, to matching recorded names in `agencies.json`. It includes
126 distinct exported agencies across all eight committees. Historical names
are not combined with successor departments. The infrastructure department has
functions allocated to two committees: its whole-agency figures appear in both,
with a source note explaining that they are not committee-specific totals.
The communications/arts and transport subsets follow APH's function split.

The section intro defines the period for all agency totals and largest awards.
“Recent” means a rolling twelve-month window ending on each export's own date:
publication dates for contracts, agreement dates for grants. Future agreements,
undated rows and duplicate record IDs are excluded. Contract amendments are
already deduplicated in the agency projection. Grant shards are a sample of
the source register; the page states that counts cover the available exports.
Totals include all exported awards in the window. The largest three carry the
available official notice/award links; a fallback to the source register is
explicitly labelled. The sole grant-agency alias expands NHMRC's acronym in its
recorded name. No donor, party or politician fields enter the estimates
projection. Private grant recipient names are withheld.
The hub does not read donor records. Other SSR, search and sitemap surfaces
retain main's shared `isOrganisationDonor` classifier from `donor-entity.js`.
An agency with zero exported grants in this window says “No grants in this
period”; this is a zero count within the stated export coverage, not missing data.
“Largest recorded awards, by value” orders the three largest exported amounts
in those same dated windows. This is a factual list of agency awards. The
no-rankings rule concerns people and candidates; award labels use no evaluative
language.

The dates shown on model summaries are their generation date, falling back to
the summary's recorded as-of date. Undated model text is withheld. Sponsor links
use the existing validated sponsor resolver and canonical person slugs.
Government bills without a named sponsor show their recorded portfolio. Only a
bill without either field says “Sponsor not recorded”. Each bill has one
introduced-date/house/sponsor meta line; the source line does not repeat its date.
Rows without dated model summaries show no summary placeholder.

## Division coverage

Weeks that have started and have no exported divisions state: “Federal divisions
in OPAX's published record currently run to <date>; divisions held after that
date will appear here once the record is updated.” The date is derived from all
federal records in `divisions/index.json`, including dates outside the configured
hub periods, and saved as `latestFederalDivision`. The published corpus snapshot
(`corpus.json.version`) dates the source line separately; it does not establish
division coverage. Upcoming empty weeks retain the
morning-after-arrival message. A missing export does not establish that no
divisions were held. The date normalization in the build uses the same `day`
helper as week derivation, including a timestamp on a period's final day.

The 10 October investigation found 10,574 federal division shards (6,986 Senate,
3,588 House), both ending on 20 August 2026. Every shard date is `YYYY-MM-DD`;
the 32 index records for 14–17 September are NSW divisions. Federal bill-linked
divisions also stop on 20 August. A read-only check of the local database found
69 federal divisions with votes for 14–17 September in the legacy `divisions`
table (51 Senate, 18 House); `votes.json` also contains September federal bill
votes. `tvfy_refresh.py` refreshes that legacy table, while
`export_division_pages.py` reads `ext_divisions`, which still ends on 20 August.
This identifies a downstream legacy-to-ext projection gap, not a hub date,
timezone or chamber filter error, and not evidence of a TheyVoteForYou lag.
Refreshing that projection belongs to the data pipeline lane. No database or
vote export was changed during this investigation.

“Most active speakers” is omitted: static bill exports contain a capped sample
of 24 bill-linked speeches per bill, not a complete dated speech export for a
sitting week. Deduplicating that sample would still produce a misleading
whole-week count. The hub never asks the knowledge box for it.

The homepage receives no new block. Existing `/bills` and crawl-discovery entry
points provide a focused route into these dated pages; review their use before
adding a homepage entry.
