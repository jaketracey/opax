# Build 7: reports lane

Native Reports index and six standing report readers, report-section routes,
Topics A–Z and topic readers, Sources & coverage, and Methods. Today adds
Spotlight on (Gambling, Housing, Climate), static collection counts and the
static homepage's From the record previews. Reports is linked from Today and
About; Methods is linked from About. The lane is merged with build 14
(`9c3c8768`), including the shared native record reader. Search's Browse links
remain owned by the directories lane.

The resumed screens use the current design system: category accents,
BigFigure, compact topic sparklines, party chips, disclosures and info sheets.
Long caveats retain their wording behind info buttons. Report and preview
attribution and licence/code text live in Sources and licences. Records open
through the shared resolver, and Methods links to Sources and licences.

## Matrix

| Row | Delivery |
| --- | --- |
| A4 | Spotlight switch reads the static report JSON; session cached. |
| A6 | Today reads only corpus.json for coverage. Expected resources and collected speeches remain distinct from live index totals. |
| A7 | Delivered: the homepage embeds these previews in static HTML. Native controls page through the frozen previews without fetching or autoplay. The source supplies no snapshot date, which is disclosed. |
| I1 | Seven report entries; six readers with exact lede/essay prose, citations, Now/Over time/Money, comparison figures and every deduplicated source. Grants allocation resolves through fromWebPath and remains on the web until its owning lane is integrated. Immigration and First Nations have no donor-industry Money tab, matching the web. |
| I2 | /reports/slug/s/n resolves to the selected numbered section and shares that canonical path. Sections are numbered across Now and the historical eras, as on the web. |
| I3 | Topics A–Z, counts, share, descriptions and decade sparklines; A–Z/most-discussed ordering. |
| I4 | Party/parliament counts, money where the web pairs a donor industry, share and label coverage by decade, chronological speech window and cited record links. The topic's money list uses party aggregates rather than unverified donor identities (decision 3). Filtered topic shares retain their selection. No Ask box. |
| I5 | Reader-chosen live corpus statistics and manifest/source coverage, including missing facet handling. |
| I6 | Native Methods and citation guidance copied from index.html, with manifest defects and source links. One false coverage sentence is corrected below. |

All documents and delegated grants links use fromWebPath, with the existing
in-app source browser as fallback. Sharing uses the existing metadata helper.
There is no document reader, Ask entry point, 3D map or Worker change in this lane.

## Paid requests

One request per route per explicit action, with in-flight deduplication and
session caching. Revisiting a successful screen sends zero more requests.
A failed read can be retried by an explicit Try again; paid reads have zero
automatic retries and no foreground/timer refresh. No paid read runs on Today.

| Route | Trigger | Maximum requests per action |
| --- | --- | --- |
| /api/topics | Open Topics A–Z | 1; session reused |
| /api/tide | Open Topics A–Z or a topic | 1 shared across those screens for the session |
| /api/topic/slug | Open that topic | 1 per topic for the session |
| /api/search | Open a topic's chronological speech window, or choose a party/parliament/decade/debate | 1 per distinct topic/filter window for the session; speech, hybrid, page 1, per 200, newest, matching web parameters |
| /api/stats | Open Sources & coverage | 1; session reused |
| /api/matrix | Tap a report's Money tab for Words per dollar | 1; session reused |
| /api/resource/slug | Tap a citation or speech; delegated to the records lane | 1 per record for the session; no row prefetch |

Report prose, citations, source lists and Today coverage use static JSON. The
matrix is necessary only for the web's party shares in Words per dollar; ranked
voices in report JSON are not a substitute for its full denominator. No briefs
are fetched for individual speech rows: the retrieved passages remain labelled
as passages. The speech window is up to 200, with native paging in 30s.

## Upstream caveats

- Methods says NSW/VIC start in 2015. The manifest says Victorian Parliament
  2018–2026. The native coverage sentence uses the manifest's NSW, VIC and QLD
  windows; the rest of the web's Methods and how-to-cite text is verbatim.
- Words per dollar says its donor side is the top 250. The current export has
  400 donor nodes: 250 ranked by disclosed donations plus 150 included through
  public-money coverage. The native view uses the export's coverage metadata,
  retaining the exact AEC threshold and comparison/causation caveats rather
  than repeating the stale top-250 claim.

## Fixture and verification contract

Seven static report files are pinned by commit/hash/size in fixture-snapshot.
The local reports fixture projects synthetic API contracts from those pinned
public exports, never calls a Worker or the live paid endpoints, and invents
no quotations or facts about people. Its topic totals cover the six reports,
party counts cover their ranked voices, and its speech window is the report
source set. These are fixture response contracts, not a captured live index.
The native citation handoff serves a pinned excerpt only, explicitly labelled
as incomplete. Existing search and reader fixture responses take precedence
where the same resource is shared.

Journeys 38 and 39 cover the required routes, the native citation handoff and
section sharing, once at standard text size. Regressions are 01 and 13. AX5 is
screenshot-only for the six new screens and the report-section destination.
The About entry is checked in the screenshot capture. The single assigned
simulator uses the shared lock and is shut down after each run.

Private before/after evidence and measured gate results are indexed at
`mobile/private/qa/reports/index.md`. `npm run qa` passed: 121 Jest suites,
3,655 tests; 70 release-tooling tests, 12 privacy-scan tests, 27 lock checks,
36 simulator-harness checks, typecheck, lint, static policy and the advisory
baseline. Native build passed. Standard journeys 38, 39, 01 and 13 completed;
seven AX5 destinations were visually reviewed without horizontal clipping or
overlap. Final spacing/statistics captures passed after a source-only JS refresh
in the unchanged native container. Earlier selector failures and the per-flow
success evidence are documented in the private index. All connection audits
passed with zero observed production/non-loopback connections and no fixture
request outside the allow-list. The simulator is shut down and the lock released.

There is no `web/reports` branch and no Worker, production paid call,
deployment, push or release upload in this lane.
