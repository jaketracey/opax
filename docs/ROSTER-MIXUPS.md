# Roster identity and era audit — 6 October 2026

Baseline: `origin/main` at `23cad95a`, 1,700 roster entries, 605,149 speeches. The desktop database was unavailable. Only `portal/public/parliamentarians.json` was regenerated, using the electorate manifest's pinned release `b56417062ccc33cf`, its independent OpenAustralia service terms and official Victorian roster, and the reviewed, sourced service facts in `scripts/roster_service.json`. No portraits, votes, pay, expenses, immutable electorate release, or page code changed. Search build output is excluded from the commit.

## Exact export failures

* **Bob Horne / Melissa Horne:** `scripts/vm/export_people.sh` exported `members.full_name/state/chamber/electorate` to `enrich_profile_jurisdictions.enrich()`. That join checked the name, jurisdiction and chamber of the member row, but trusted its electorate string. A contaminated Bob/federal/representatives row therefore passed and exported Melissa's `Williamstown – Minister for Ports and Freight, Minister for Roads and Road Safety, Minister for Health Infrastructure` as Bob's federal seat. There was no check that the seat belonged to the named person in their recorded years. The pinned OpenAustralia terms put Robert Hodges Horne in Paterson, 1993–1996 and 1998–2001; the [AEC 1998 elected list](https://aec.gov.au/Elections/federal_elections/1998/hor-elected.htm) explicitly calls that member Bob Horne. The reviewed alias is scoped to that federal chamber. The desktop mutation that originally poisoned `members.electorate` cannot be reconstructed from these exports; this audit proves and fixes the export step that admitted it.
* **Mark Latham:** `export_parliamentarians.py` grouped normalized names over all jurisdictions and years, counted parties together, and emitted one dominant `party` beside the union of chambers. Federal Labor therefore accompanied the later NSW Council chamber. The representation enrichment also accepted Werriwa on the NSW member stub because it checked the stub's chamber, not the constituency. This is a genuine federal/state career, not two people: federal Labor/Werriwa ends 21 January 2005 in the pinned terms, NSW One Nation starts in 2019, and the [22 August 2023 Council minutes, page 374](https://www.parliament.nsw.gov.au/hp/housepaper/29312/19-Min-20230822-Cor.pdf) record his move to the independent crossbench. His [parliamentary service page](https://www.parliament.nsw.gov.au/members-and-electorates/members-and-ministers/members-details?memberId=2251) records the 2019–2023 and 2023 onward Council terms. The export now retains dated `affiliations`, uses Independent for the latest service, and keeps Labor associated with the federal term. The flat NSW party facets contain Independent and One Nation.
* **General surname fallback:** the exporter previously accepted the dominant nonnumeric state `person_id` for missing party and `full`, even after the federal verifier refused a mixed print. Enrichment also joined a bare surname exactly to a surname member stub without dates. Both paths now reject prints spanning parliaments/houses or witnesses. State identity fallback requires the person's name, jurisdiction and chamber; weak names require one linked id, one candidate and a term covering their recorded years. Mixed prints retain transcript scopes/counts/dates and `recorded_parties`, with no person's id, full-name alias, party facet or representation.

## Named records corrected

| Person | Before | After / evidence |
|---|---|---|
| Bob Horne | Melissa's Williamstown seat and portfolios under a federal MP | Paterson, NSW; dated pinned federal terms plus the AEC alias above |
| Melissa Horne | Williamstown but no Labor facet, so absent from the Victorian Labor result | Williamstown, Victorian Assembly, Labor from the official 9 September pinned roster |
| Mark Latham | Labor NSW MLC; Werriwa assigned to the Council | Independent NSW MLC; statewide NSW Council representation and federal Werriwa; dated party/service history retained |
| David Kemp | Oxley, QLD (same surname as Michael Kemp, NSW Oxley) | Goldstein, VIC, from his dated pinned federal terms |
| Michael Lee | Parramatta (Geoff Lee's NSW seat) | Dobell, NSW, from his dated pinned federal terms |
| Lynda Voltz | Auburn assigned to the Council | Auburn / Assembly from 23 March 2019; statewide Council 24 March 2007–28 February 2019, from her [official service page](https://www.parliament.nsw.gov.au/members-and-electorates/members-and-ministers/members-details?memberId=42); latest chamber listed first |
| Ingrid Stitt | Portfolios appended to the Western Metropolitan electorate | Western Metropolitan only; portfolios are not part of a seat name |
| Bronnie Taylor | Alternate statewide Council constituency label | Canonical New South Wales statewide label; this was label normalization, not a mistaken person |
| Ros Spence | Current Kalkallo plus undated Yuroke on a 2023–2026 entry | Kalkallo once, as established by the official pinned 9 September roster; an unsupported past-seat join is removed |

## Whole-roster result

296 rows change: the nine named records above and 287 mixed surname/initials prints below. 175 unsupported full-name aliases are removed. All 1,700 rows remain; no `speeches`, `states`, `chambers`, `first`, `last` or `witness_rows` value changes. Those fields describe transcript aggregates, not an asserted individual's complete service. A fresh pid audit using `roster_identity.reverify()` against pinned members finds zero remaining pid corrections. Repeating the pinned representation repair makes zero changes.

The scan examined every row's identity, representation and party scope; compared full-name federal seats against dated service; checked state Council district/office contamination and portfolio suffixes; and checked same-surname full-name candidates in overlapping transcript years. Different ids in overlapping dated service terms remain ambiguous. Legitimate spelling changes at adjacent or disjoint service periods are preserved. An immutable legacy OPAX member snapshot is excluded as independent evidence, so the fix cannot validate a bad record against a copy of itself.

The mixed prints below are quarantined from single-person joins. The former alias and seats are included for review; a blank cell means that kind of link was already absent. Speech party labels, if present, move to `recorded_parties`.

| Print | Former full-name alias | Representation removed | Single-person party removed |
|---|---|---|---|
| Abbott |  |  | Liberal |
| Adams |  |  | Labor |
| Addison | Juliana Addison | vic / vic_la: Wendouree |  |
| Aitchison | Jenny Aitchison |  |  |
| Anderson |  |  | Nationals |
| Andrew | Stephen Andrew |  | One Nation |
| Andrews | Daniel Andrews | vic / vic_la: Mulgrave | Liberal |
| Angus | Neil Angus |  |  |
| Anthony |  | federal / representatives: Richmond | Nationals |
| Ayres |  |  | Labor |
| Bailey | Mc Bailey |  | Labor |
| Baird |  |  | Liberal |
| Baldwin |  |  | Liberal |
| Barr | Andrew Barr |  | Labor |
| Barrett | Scott Barrett |  |  |
| Barry | Chiaka Barry |  | Liberal |
| Bartlett |  |  | Liberal |
| Bates | Ros Bates |  | LNP |
| Batt |  |  | LNP |
| Bedford | Frances Bedford |  | Independent |
| Bell | Troy Bell |  | One Nation |
| Bennett | Stephen Bennett |  | LNP |
| Berry | Yvette Berry |  | Labor |
| Billson |  |  | Liberal |
| Bilyk |  |  | Labor |
| Birrell |  |  | Nationals |
| Bishop |  |  | Liberal |
| Blackwood | Gary Blackwood |  |  |
| Blair | Niall Blair |  |  |
| Boele |  |  | Independent |
| Bolton | Sandy Bolton |  | Independent |
| Bourne | Wendy Bourne |  | Labor |
| Bowen |  |  | Labor |
| Boyd | Nikki Boyd |  | Labor |
| Boyer | Blair Boyer |  | Labor |
| Brereton |  | federal / representatives: Kingsford Smith | Labor |
| Brooks | Colin Brooks | vic / vic_la: Bundoora |  |
| Brown | Michael Brown |  | Labor |
| Burgess | By Burgess | vic / vic_la: Hastings |  |
| Burke |  |  | Labor |
| Bush | Jonty Bush |  | Labor |
| Butler | Liza Butler |  |  |
| C.M. Scriven |  |  | Labor |
| Cain | Peter Cain |  | Liberal |
| Campbell |  |  | Labor |
| Carroll | Ben Carroll | vic / vic_la: Niddrie |  |
| Carter | Susan Carter |  |  |
| Castley | Leanne Castley |  | Independent |
| Chandler |  |  | Liberal |
| Chandler-Mather |  |  | Greens |
| Chapman | Vickie Chapman |  | Liberal |
| Charles |  | federal / representatives: La Trobe | Liberal |
| Chisholm |  |  | Labor |
| Clancy | Nadia Clancy |  |  |
| Clark | Robert Clark |  |  |
| Clarke | David Clarke |  |  |
| Clay | Jo Clay |  | Greens |
| Close | Susan Close |  | Labor |
| Coleman |  |  | Liberal |
| Collins |  |  | Liberal |
| Connolly | Sarah Connolly | vic / vic_la: Tarneit |  |
| Cook | Nat Cook |  | Labor |
| Cooke | Steph Cooke |  |  |
| Costello |  |  | Liberal |
| Cox |  | federal / representatives: Kingston | Labor |
| Crawford | Cd Crawford | qld / qld_la: Barron River | Labor |
| Cross | Matt Cross |  |  |
| Crouch | Adam Crouch |  |  |
| Cusack | Catherine Cusack |  |  |
| Dalton | Nigel Dalton |  | LNP |
| Davey |  |  | Nationals |
| Davies | Tanya Davies |  |  |
| Davis | Donna Davis |  |  |
| Dick | Cameron Dick |  | Labor |
| Dillon | Sean Dillon |  | LNP |
| Donnelly | Greg Donnelly |  |  |
| Dowling |  |  | Labor |
| Doyle |  |  | Labor |
| Duniam |  |  | Liberal |
| Edwards | Maree Edwards |  | Labor |
| Ellis | Fraser Ellis |  | Labor |
| Emerson | Thomas Emerson |  | Labor |
| Evans |  |  | Liberal |
| Fang | Wes Fang |  |  |
| Farmer | De Farmer |  | Labor |
| Farrell |  |  | Labor |
| Fawcett |  |  | Liberal |
| Field | Russell Field |  | LNP |
| Foley | Martin Foley |  |  |
| Franklin | Ben Franklin |  |  |
| Gallagher |  |  | Labor |
| Gardner | J.A.W. Gardner | sa / sa_ha: Morialta |  |
| Garrett |  | vic / vic_la: Brunswick | Labor |
| Gee |  |  | Independent |
| George |  |  | Labor |
| Gilbert | Julieanne Gilbert |  | Labor |
| Gosling |  |  | Labor |
| Grace | Grace Grace |  | Labor |
| Graham | John Graham |  |  |
| Grant | Troy Grant |  |  |
| Green | By Green | vic / vic_la: Yan Yean | Labor |
| Gregg |  |  | Labor |
| Griffin | James Griffin |  |  |
| Guy | Matthew Guy | vic / vic_la: Bulleen |  |
| Haines |  |  | Independent |
| Halfpenny | Bronwyn Halfpenny |  | Labor |
| Hall | Katie Hall | vic / vic_la: Footscray | Labor |
| Hanson | Jeremy Hanson |  | One Nation |
| Harper | Aaron Harper |  | Labor |
| Harris | David Harris |  |  |
| Harrison | Jodie Harrison |  |  |
| Hart | Michael Hart |  | LNP |
| Harvey | Richard Manuel Harvey |  | Liberal |
| Hawke |  |  | Liberal |
| Head | Bryson Head |  | LNP |
| Henderson |  |  | Liberal |
| Hennessy | Jill Hennessy |  |  |
| Hoare |  |  | Labor |
| Holland | Michael Holland |  |  |
| Hood | D.G.E. Hood | sa / sa_ha: Adelaide |  |
| Horne | Melissa Horne | vic / vic_la: Williamstown | Labor |
| Howard | Jennifer Howard |  | Liberal |
| Hughes | Eddie Hughes |  | Liberal |
| Hunt | Jason Hunt |  | LNP |
| Hurst | Emma Hurst |  |  |
| Hutton | Nigel Hutton |  | LNP |
| Irwin |  |  | Labor |
| J.M.A. Lensink |  | sa / sa_lc: Minister for Human Services |  |
| Jackson | Rose Jackson |  | Labor |
| James | Bree James |  | LNP |
| Jenkins |  |  | Labor |
| Johnson |  |  | Liberal |
| K.J. Maher |  |  | Labor |
| Katter | Rob Katter |  | Katter's Australian Party |
| Kelly | Joe Kelly |  | Labor |
| Kemp | Michael Kemp |  | Liberal |
| Kennedy | John Kennedy |  | Liberal |
| Kerr |  |  | Labor |
| King | Shane King |  | Labor |
| Kirkland | Donna Kirkland |  | LNP |
| Knight | Sharon Knight |  |  |
| Krause | Jon Krause |  | LNP |
| Lane | Jordan Lane |  | Liberal |
| Latham |  | federal / representatives: Werriwa | Labor |
| Lawrence |  |  | Labor |
| Le |  |  | Independent |
| Leahy | Ann Leahy |  | LNP |
| Lee | Elizabeth Lee |  | LNP |
| Liddle |  |  | Liberal |
| Lim |  |  | Labor |
| Lindsay |  |  | Liberal |
| Lister | James Lister |  | LNP |
| Lloyd |  |  | Liberal |
| Lui | Cynthia Lui |  | Labor |
| Lynch | Paul Lynch |  |  |
| MacDonald | Aileen MacDonald |  |  |
| Marshall | Steven Marshall |  | Liberal |
| Martin | James Martin |  | Labor |
| McAllister |  |  | Labor |
| McBride | Nick McBride |  |  |
| McCarthy |  |  | Labor |
| McClelland |  |  | Labor |
| McCormack |  |  | Nationals |
| McDonald |  |  | LNP |
| McGhie | Steve McGhie | vic / vic_la: Melton |  |
| McGrath |  |  | LNP |
| McGuire | Frank McGuire |  |  |
| McKenzie |  |  | Nationals |
| McKim |  |  | Greens |
| McLeay |  |  | Labor |
| McLeish | Cindy McLeish | vic / vic_la: Eildon |  |
| McMahon | Melissa McMahon |  | Labor |
| McMillan | Corrine McMillan |  | Labor |
| McMullan |  |  | Labor |
| McNamara |  |  | Liberal |
| Millar | Lachlan Millar |  | LNP |
| Mitchell |  |  | Labor |
| Moriarty | Tara Moriarty |  |  |
| Morris | Deborah Morris | vic / vic_la: Mornington | Liberal |
| Morton | Kendall Morton |  | LNP |
| Moylan | Brendan Moylan |  | Liberal |
| Mulholland |  |  | Labor |
| Mullen | Charis Mullen |  | Labor |
| Munro | Jacqui Munro |  |  |
| Murphy |  |  | Labor |
| Murray | Steve Murray |  | Liberal |
| Nelson |  |  | Liberal |
| Neville | Lisa Neville |  | Nationals |
| Ng |  |  | Labor |
| Nicholls | Tim Nicholls |  | LNP |
| Nightingale | Margie Nightingale |  | Labor |
| Noonan | Wade Noonan |  |  |
| Northe | By Northe | vic / vic_la: Morwell |  |
| O'Byrne |  | federal / representatives: Bass | Labor |
| O'Connor |  |  | Labor |
| O'Keefe |  |  | Labor |
| O'Neill |  |  | Labor |
| O'Sullivan |  |  | Liberal |
| Orr | Suzanne Orr |  | Labor |
| Pakula | Martin Pakula |  |  |
| Park | Ryan Park |  |  |
| Parker | Jamie Parker |  |  |
| Paterson |  |  | Liberal |
| Patterson | S.J.R. Patterson | sa / sa_ha: Morphett |  |
| Pearce | Rhiannon Pearce |  |  |
| Pearson | Danny Pearson | vic / vic_la: Essendon |  |
| Perrett | Tony Perrett |  | LNP |
| Pettersson | Michael Pettersson |  | Labor |
| Phillips |  |  | Labor |
| Piper | Greg Piper |  |  |
| Poole | Janelle Poole |  | LNP |
| Porter |  |  | Liberal |
| Powell | Andrew Powell |  | LNP |
| Power | Linus Power |  | Labor |
| Pratt | Penny Pratt |  | Labor |
| Preston | Robyn Preston |  |  |
| Price |  |  | Liberal |
| Pugh | Jess Pugh |  | Labor |
| R.I. Lucas |  |  | Liberal |
| Rae |  |  | Labor |
| Ray |  |  | Labor |
| Read | Tim Read |  | Greens |
| Reid |  |  | Labor |
| Reynolds |  |  | Liberal |
| Richards | Pauline Richards | vic / vic_la: Cranbourne | Labor |
| Richardson | Tim Richardson | vic / vic_la: Mordialloc |  |
| Riordan | Richard Riordan |  | Liberal |
| Roberts |  |  | One Nation |
| Robinson | Mark Robinson |  | LNP |
| Rudd |  |  | Labor |
| Ryall | Dee Ryall |  |  |
| Ryan |  | qld / qld_la: Morayfield | Independent |
| S.G. Wade |  |  | Liberal |
| Saunders | Bruce Saunders |  | Labor |
| Scarr |  |  | Liberal |
| Sciacca |  | federal / representatives: Bowman | Labor |
| Scott | Robin Scott |  |  |
| Sharpe | Penny Sharpe |  |  |
| Sheldon |  |  | Labor |
| Shoebridge |  |  | Greens |
| Sidoti | John Sidoti |  |  |
| Simpson | Fiona Simpson |  | LNP |
| Singh | Gurmesh Singh |  |  |
| Small |  |  | Liberal |
| Smith | Tom Smith |  | Labor |
| Spence | Ros Spence |  |  |
| Steel | Chris Steel |  | Labor |
| Stevens | Ray Stevens |  | LNP |
| Stewart |  |  | Labor |
| Stuart | Maryanne Stuart |  |  |
| Sullivan |  | qld / qld_la: Stafford | Labor |
| Swan |  |  | Labor |
| Tanner |  |  | Labor |
| Taylor | Jackson Taylor |  | Labor |
| Telfer | Sam Telfer |  |  |
| Theophanous | Kat Theophanous | federal / representatives: Northcote; vic / vic_la: Northcote | Labor |
| Thomas | Mary-Anne Thomas | vic / vic_la: Macedon |  |
| Thompson | Erin Thompson |  | LNP |
| Thomson | Marsha Thomson |  |  |
| Thorpe |  |  | Independent |
| Tilley | Bill Tilley | vic / vic_la: Benambra |  |
| Treloar | Peter Treloar |  | Liberal |
| Tudehope | Monica Tudehope |  | Liberal |
| Urquhart |  |  | Labor |
| Walker |  |  | Labor |
| Wallace |  |  | LNP |
| Walsh |  |  | Labor |
| Ward | Vicki Ward | vic / vic_la: Eltham |  |
| Ware |  |  | Liberal |
| Warren | Greg Warren |  |  |
| Washington | Kate Washington |  |  |
| Waters |  |  | Greens |
| Watson | Anna Watson |  |  |
| Watt |  | vic / vic_la: Burwood | Labor |
| Watts | Trevor Watts |  | LNP |
| Wells | Kim Wells | vic / vic_la: Rowville |  |
| Whiteaker |  |  | Labor |
| Whiting | Chris Whiting |  | Labor |
| Wilkinson | Kylie Wilkinson |  | Labor |
| Williams | Gabrielle Williams | vic / vic_la: Dandenong |  |
| Williamson | Richie Williamson |  | Liberal |
| Wilson | Felicity Wilson |  |  |
| Wong |  |  | Labor |
| Wooldridge | Michael Wooldridge |  | Liberal |
| Worth |  | federal / representatives: Adelaide | Liberal |
| Young | Rebecca Young |  | LNP |
| Zahra |  | federal / representatives: McMillan | Labor |

## Reproduction and validation

Local Node version: `v24.21.0`; dependencies installed with `npm ci` in `portal/`. Wrangler ran with `--local --port 8794`, with no secrets or remote bindings. Headless installed Google Chrome loaded actual local page/static exports. Because the KB was unreachable, `/api/*` returned empty fixture responses; external requests were blocked. These checks prove the roster-driven profile, SEO title, party view and record panels; they do not claim a live KB speech search.

Before and after screenshots, page text and browser assertions are in the ignored `scripts/_photos_work/qa-roster-mixups/{before,after}/`: `bob-horne.png`, `melissa-horne.png`, `mark-latham.png`, `labor-vic.png`, `labor-nsw.png`, and `labor-party.png`. The Victorian Labor/Horne view changes from the mixed Horne print to Melissa alone. The NSW Labor/Latham view changes from Mark and the mixed Latham print to an empty result. Bob's title/infobox change from Williamstown/portfolios to Paterson; Mark's title changes from Labor to Independent MLC. Browser assertions pass with zero page errors.

Required gates: `npm run build:search` before `npm test`; `npm run check`; Python tests for the exporter, identity, representation, wrapper and dependent grants consumers. Final results: 845/845 portal tests; `npm run check` passes; 33 exporter/identity/representation/wrapper Python tests plus 4 dependent grants tests pass (37 total); portrait identity audit passes; Linux nightly rehearsal passes 199 checks with zero failures. The initial macOS nightly attempt was unsuitable because `flock` is absent; the supported Linux container run passed. No pushing, production write, or deployment was performed.

Regeneration command: `python3 scripts/enrich_profile_jurisdictions.py --pinned`. The roster SHA-256 is `99832df7fde486452758e0c7c66a937d795a75de2403e315a0c068237a730b45`; the baseline was `b779c17e3de7fca98c55e450a6d74e4eaf029f7271ea1828d17f722dd2bfa4a0`. Logs and browser harness are in the same ignored QA directory.
