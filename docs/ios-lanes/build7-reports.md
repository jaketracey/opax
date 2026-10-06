# Build 7: reports lane

Native Reports index and six standing report readers, report-section routes,
Topics A–Z and topic readers, Sources & coverage, and Methods. Today adds
Spotlight on (Gambling, Housing, Climate), static collection counts and the
static homepage's From the record previews. Reports is linked from Today and
About; Methods is linked from About. Search's Browse links are unchanged.

## Matrix

| Row | Delivery |
| --- | --- |
| A4 | Spotlight switch reads the static report JSON; session cached. |
| A6 | Today reads only corpus.json for coverage. Expected resources and collected speeches remain distinct from live index totals. |
| A7 | Delivered: the homepage embeds these previews in static HTML. Native controls page through the frozen previews without fetching or autoplay. The source supplies no snapshot date, which is disclosed. |
| I1 | Seven report entries; six readers with exact lede/essay prose, citations, Now/Over time/Money, comparison figures and every deduplicated source. Grants allocation resolves through fromWebPath and remains on the web until its owning lane is integrated. Immigration and First Nations have no donor-industry Money tab, matching the web. |
| I2 | /reports/slug/s/n resolves to the selected numbered section and shares that canonical path. Sections are numbered across Now and the historical eras, as on the web. |
| I3 | Topics A–Z, counts, share, descriptions and decade sparklines; A–Z/most-discussed ordering. |
| I4 | Party/parliament counts, money where the web pairs a donor industry, share and label coverage by decade, chronological speech window and cited record links. No Ask box. |
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

Journeys 38 and 39 cover the required routes, citation fallback and section
sharing. They run at standard text size and AX5. Regressions are 01, the
canonical 13 Today flow, and 14 About. Private logs and screenshots are under
mobile/private/qa/reports/. Final measured gate results accompany the lane SHA
in the handoff; this document does not claim simulator proof before that run.
