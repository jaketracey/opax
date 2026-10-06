# Roster identity and era audit — round 1, 6 October 2026

Baselines: `origin/main` at `23cad95a` and the reviewed first repair `ecc26aa2`.
The desktop database remains unreachable. Repairs use the manifest-pinned
release `b56417062ccc33cf`, its independent OpenAustralia terms and official
Victorian roster, plus the dated public evidence frozen in
`scripts/roster_service.json` and `scripts/roster_state_evidence.json`. The latter
records source URLs, snapshot dates and document hashes where downloadable.
Former members in a chamber index are dated before leaving, rather than all
being assigned its final publication date. A roster snapshot establishes its
date; it does not erase valid earlier seats.

No database changes, KB publication, push or deploy were performed. Public KB
resources were read with GET requests for the dry run. Only the roster was
regenerated; portraits, votes, pay, expenses and the immutable electorate
release are unchanged. Search build output is excluded from the commit.

## Source causes and rules

* **Bob Horne / Melissa Horne:** `export_people.sh` fed member name, jurisdiction,
  chamber and electorate into `enrich_profile_jurisdictions.enrich()`. The old
  join trusted the electorate string on an otherwise agreeing Bob/federal/
  representatives stub, admitting Melissa's Williamstown and portfolios. The
  dated federal terms and [AEC 1998 elected list](https://aec.gov.au/Elections/federal_elections/1998/hor-elected.htm)
  link Bob / Robert Hodges Horne to Paterson. The unavailable database's original
  mutation is unknown; the export step that admitted it is fixed.
* **Mark Latham:** the SQL export grouped names across jurisdictions and years,
  then paired a dominant federal Labor label with the union of chambers. The
  member-stub join also admitted Werriwa as a NSW Council electorate. Shared
  repair preserves federal Labor/Werriwa and the separately dated NSW One Nation
  and Independent service. The flat latest NSW affiliation is Independent.
* **Over-removal:** the first repair treated every multi-parliament, witness or
  two-house weak print as ambiguous. Resolution now checks the complete compatible
  candidate set before removing identity. Exactly one agreeing roster person
  keeps their name and party; conflicting names or overlapping identities are
  refused. Dated full-name transcript prints also expose newer namesakes absent
  from an older snapshot, such as Monica and Damien Tudehope. Malformed initials
  and bylines are excluded from that candidate set. A resolved aggregate containing
  witnesses or multiple parliaments still gets no numeric pid or sitting flag.
* **Undated state stubs:** missing `entered_house` is unknown, not contradictory.
  Known dates must overlap; name, jurisdiction and chamber must agree, and the
  candidate must be unique. Undated legacy stubs corroborate a name; they cannot
  repair a seat or party against independent dated evidence. The numeric federal
  pid verifier retains its existing stricter ownership rule.
* **Two houses:** a single state's two-house career does not by itself establish
  two people. This matches the photo guard. Kyam Maher, Rob Lucas, Stephen Wade,
  Clare Scriven and Michelle Lensink retain their names and parties. Lensink's
  ministerial office is replaced with statewide South Australia.
* **Aliases:** `normalize_state_speaker_name()` removes a leading `By` and
  preserves compact uppercase initials as dotted initials instead of making them
  given names. Repair rejects unusable aliases and recovers real names from dated
  sources (Louise Staley, Shannon Fentiman, Glenn Butcher, Leeanne Enoch, Leanne
  Linard, Mark Furner, Amanda Stoker, Pat Weir and David Basham). AEC's dated 1998
  seat list also links Jenny/Jennifer Macklin, Joe/Joseph Hockey and Bernie/Bernard
  Ripoll, preserving their already verified numeric ids.

## Nine original corrections and visible careers

| Person | Corrected data retained in this round |
|---|---|
| Bob Horne | Paterson, NSW; Melissa's Williamstown and portfolios removed |
| Melissa Horne | Williamstown, Victorian Assembly, Labor |
| Mark Latham | Independent NSW MLC; federal Labor/Werriwa to 21 January 2005, then dated NSW One Nation and Independent service |
| David Kemp | Goldstein, VIC; namesake Michael Kemp's Oxley removed |
| Michael Lee | Dobell, NSW; Geoff Lee's Parramatta removed |
| Lynda Voltz | Council 24 March 2007–28 February 2019; Auburn / Assembly from 23 March 2019, Labor |
| Ingrid Stitt | Western Metropolitan; portfolios removed from electorate text |
| Bronnie Taylor | Canonical statewide New South Wales Council label |
| Ros Spence | Kalkallo retained; Yuroke restored with 29 November 2014–26 November 2022 service evidence |

The profile infobox now renders dated parliamentary service with party, seat,
chamber, dates and source links. Mark's title uses the dated current Council
service rather than interpreting `current` as federal Werriwa tenure. Mark and
Voltz carry both `current` and `party_now`; the weak Latham aggregate carries
neither. Service-seat de-duplication ignores description/basis differences.

## Whole-roster comparison

Party facets count roster rows (including historical transcript aggregates).
Web recorded-speaker counts use the unchanged client identity rule: numeric pid,
otherwise lowercase `full || name`. These are directory counts, not a claim
that every speech in a weak aggregate belongs to its resolved parliamentarian.

| Count | origin/main | ecc26aa2 | Round 1 |
|---|---:|---:|---:|
| Roster rows | 1,700 | 1,700 | 1,700 |
| Speeches | 605,149 | 605,149 | 605,149 |
| Rows with party | 1,177 | 967 | 1,131 |
| Rows with full alias | 420 | 245 | 443 |
| Rows with representation | 985 | 944 | 963 |
| Current rows | 328 | 328 | 330 |
| Rows with party_now | 328 | 330 | 330 |
| Rows with numeric pid | 740 | 740 | 740 |
| Queensland Labor facet | 57 | 27 | 44 |
| Queensland LNP facet | 56 | 29 | 47 |
| Web recorded speakers: Labor | 451 | 350 | 428 |
| Web recorded speakers: LNP | 92 | 61 | 82 |

Of the reviewed 287 removals, **164** now keep a compatible name or
party and **123** remain neutral. **89 of the 175 removed aliases** are
recovered; 86 remain unsupported or contradicted by competing people. All
11 sampled correct identities marked L by the reviewer are retained. Under the
reproducible narrower criterion “lost alias, no full-name surname sibling, one
non-committee house, under 25% witnesses”, all 29 affected prints now recover
names. Different-name overlaps remain neutral: Berry (Carol / Yvette), Green
(Nita / Danielle), Horne (Bob / Melissa), Andrews (Kevin / Daniel), Katter
(Bob / Robbie) and Tudehope (Damien / Monica), for example.

Against main, 537 rows differ, 297 excluding provenance-only additions.
Against ecc26aa2, 408 differ, 229 excluding provenance-only additions.
Every name, speech count, state/chamber list, first/last year, witness count and
numeric pid is unchanged from main. The table below covers all 287 reviewed
prints; the following table lists additional rows with changed identity facts.

## Export and nightly reproduction

`export_parliamentarians.py` and pinned repair invoke the same `repair()`.
`export_people.sh` defers the hold check until representation enrichment is
finished, then checks the final file. Direct exporter use also repairs before
checking. The existing 25-change limit and sitting-member fail-closed checks
remain in force.

The fixed public `tests/fixtures/roster-export/prints-23cad95a.json` contains all
1,700 pre-repair prints. The test builds the production SQL schema and undated
member stubs outside Queensland, runs the real exporter and wrapper, and
compares final identities with the shipped file. **One identity difference
(McDermott), limit 25; no hold.** All named regression targets match. This proves
the box-shaped fixture path, not access to the real desktop database.

At the next refresh, one read-only query should confirm the loaders' date shape:

```sql
SELECT state, COUNT(*) AS members, SUM(entered_house IS NULL) AS undated
FROM members
WHERE state NOT IN ('federal')
GROUP BY state;
```

## Ask, search, MCP and voice evidence reconciliation

`scripts/reconcile_roster_profiles.py` is read-only by default. It inventories
owned `roster-profile-*` resources, constructs exact desired source bodies and
metadata, and plans create, replace or retire. Replacements delete/recreate the
owned derived record so stale generated fields cannot survive an ordinary
update. Original resources are backed up outside the KB. Apply preflights every
ownership/fingerprint before the first write, rechecks each mutation, and verifies
read-back; a retry is idempotent. Model generation is checked off before apply.

The credential-free public GET inventory captured all **983** live profile slugs
from the union of previous and current roster names. The public route exposes
source/kind labels but not KB `source_id`, and collapses each labelset to its
last value. The preview compares that observable projection, avoiding label-only
false positives for multi-state profiles; native publication compares all labels.
The dry-run plan states these limitations.
The approved apply must inventory the native KB again and verify `source_id`;
public/offline snapshots cannot be applied. No credentials were read or logged
for this inventory. The named stale records were confirmed live: Bob still has
Williamstown, Mark a Council Werriwa, Kemp Oxley, and Theophanous federal Northcote.

Dry run: **60 replacements, 26 retirements, 6 creates**, 963 desired profiles.
The exact JSON plan includes before/after bodies, metadata and hashes. The full
operation list follows below. Output and the captured public inventory are ignored:
`scripts/_photos_work/qa-roster-mixups/round1/roster-profile-plan.json`,
`roster-profile-plan.inventory.json`, and `roster-profile-dry-run.log`.

```sh
python3 scripts/reconcile_roster_profiles.py --dry-run \
  --inventory scripts/_photos_work/qa-roster-mixups/round1/roster-profile-plan.inventory.json \
  --output scripts/_photos_work/qa-roster-mixups/round1/roster-profile-plan.json
```

The orchestrator runs the real publication after approval, with native KB
credentials, `--apply`, `--output` and `--backup`. No apply was run here. Nightly
now performs the same reconciliation after final data validation and the portal
gate, before measuring the corpus and stamping its cache epoch. A failure is
recorded and retried next night. Rehearsals disable writes with
`OPAX_PERIODIC_SYNC_KB=0` (or `OPAX_ROSTER_SYNC_KB=0`).

## Validation and screenshots

Node `v24.21.0`. `npm run build:search` before `npm test`: **847 passed, zero
failed**; `npm run check` passes. Python: **52 passed** (40 export/identity/
representation/wrapper tests, four grants tests and eight reconciliation tests).
The grants assertions use fixed totals again: 1,431 published records, 963 roster
profiles, 737 representation-review tasks. Photo identity audit: **ok, zero
warnings**. Linux nightly rehearsal: **203 checks passed, zero failed**, including
roster apply ordering, rehearsal suppression and failure reporting. Pinned repair
is byte-idempotent. Search build output is restored after testing.

Wrangler ran locally at `127.0.0.1:8794`; installed Google Chrome ran headless.
Local API responses were empty fixtures because the desktop KB was unreachable;
all page assets and roster data were served locally. External browser requests
were blocked. For round-1 before comparisons, the browser used ecc26aa2's exact
app/helper/roster assets; the local Worker remains the current implementation.
The checks cover roster-driven pages and career rendering, not live speech search.

Ignored `scripts/_photos_work/qa-roster-mixups/round1/{before,after}/` contain
screenshots, page text and `results.json` for Bob, Melissa, Mark, Lynda, Ros,
SA/Maher, Staley aliases, Queensland Labor and the Labor party view. The after
folder also contains `mark-latham-mobile.png` with no horizontal overflow.
Assertions cover Paterson, Williamstown/Labor, Independent MLC, visible federal
Labor and Voltz Council careers, restored Yuroke, SA aliases and Louise Staley.
The original pre-main/first-repair screenshots remain in
`scripts/_photos_work/qa-roster-mixups/{before,after}/`.

## All 287 reviewed prints

“Retained” means one compatible identity resolved. “Neutral” keeps transcript
aggregates and recorded party labels, with no asserted single-person affiliation.
The registry and per-row `identity_evidence` / `identity_basis` record evidence.

| Print | Main alias | Round 1 alias | Round 1 party | Result |
|---|---|---|---|---|
| Abbott | — | — | — | neutral |
| Adams | — | — | — | neutral |
| Addison | Juliana Addison | Juliana Addison | Labor | retained |
| Aitchison | Jenny Aitchison | — | — | neutral |
| Anderson | — | John Anderson | Nationals | retained |
| Andrew | Stephen Andrew | Stephen Andrew | Katter's Australian Party | retained |
| Andrews | Daniel Andrews | — | — | neutral |
| Angus | Neil Angus | Neil Angus | — | retained |
| Anthony | — | — | — | neutral |
| Ayres | — | Tim Ayres | Labor | retained |
| Bailey | Mc Bailey | Mark Bailey | Labor | retained |
| Baird | — | Bruce Baird | Liberal | retained |
| Baldwin | — | — | — | neutral |
| Barr | Andrew Barr | — | — | neutral |
| Barrett | Scott Barrett | Scott Barrett | Nationals | retained |
| Barry | Chiaka Barry | Chiaka Barry | Liberal | retained |
| Bartlett | — | — | — | neutral |
| Bates | Ros Bates | Ros Bates | LNP | retained |
| Batt | — | David Batt | LNP | retained |
| Bedford | Frances Bedford | Frances Bedford | Independent | retained |
| Bell | Troy Bell | — | — | neutral |
| Bennett | Stephen Bennett | Stephen Bennett | LNP | retained |
| Berry | Yvette Berry | — | — | neutral |
| Billson | — | Bruce Billson | Liberal | retained |
| Bilyk | — | — | — | neutral |
| Birrell | — | Sam Birrell | Nationals | retained |
| Bishop | — | Julie Bishop | Liberal | retained |
| Blackwood | Gary Blackwood | Gary Blackwood | — | retained |
| Blair | Niall Blair | — | — | neutral |
| Boele | — | Nicolette Boele | Independent | retained |
| Bolton | Sandy Bolton | Sandy Bolton | Independent | retained |
| Bourne | Wendy Bourne | Wendy Bourne | Labor | retained |
| Bowen | — | Chris Bowen | Labor | retained |
| Boyd | Nikki Boyd | — | — | neutral |
| Boyer | Blair Boyer | Blair Boyer | Labor | retained |
| Brereton | — | — | — | neutral |
| Brooks | Colin Brooks | Colin Brooks | Labor | retained |
| Brown | Michael Brown | — | — | neutral |
| Burgess | By Burgess | Neale Burgess | — | retained |
| Burke | — | — | — | neutral |
| Bush | Jonty Bush | Jonty Bush | Labor | retained |
| Butler | Liza Butler | — | — | neutral |
| C.M. Scriven | — | Clare Scriven | Labor | retained |
| Cain | Peter Cain | Peter Cain | Liberal | retained |
| Campbell | — | Julie-Ann Campbell | Labor | retained |
| Carroll | Ben Carroll | Ben Carroll | Labor | retained |
| Carter | Susan Carter | Susan Carter | Liberal | retained |
| Castley | Leanne Castley | Leanne Castley | Independent | retained |
| Chandler | — | Claire Chandler | Liberal | retained |
| Chandler-Mather | — | Max Chandler-Mather | Greens | retained |
| Chapman | Vickie Chapman | — | — | neutral |
| Charles | — | — | — | neutral |
| Chisholm | — | Anthony Chisholm | Labor | retained |
| Clancy | Nadia Clancy | — | — | neutral |
| Clark | Robert Clark | Robert Clark | — | retained |
| Clarke | David Clarke | — | — | neutral |
| Clay | Jo Clay | Jo Clay | Greens | retained |
| Close | Susan Close | Susan Close | Labor | retained |
| Coleman | — | David Coleman | Liberal | retained |
| Collins | — | — | — | neutral |
| Connolly | Sarah Connolly | Sarah Connolly | Labor | retained |
| Cook | Nat Cook | — | — | neutral |
| Cooke | Steph Cooke | — | — | neutral |
| Costello | — | Peter Costello | Liberal | retained |
| Cox | — | — | — | neutral |
| Crawford | Cd Crawford | Craig Crawford | Labor | retained |
| Cross | Matt Cross | — | — | neutral |
| Crouch | Adam Crouch | — | — | neutral |
| Cusack | Catherine Cusack | — | — | neutral |
| Dalton | Nigel Dalton | — | — | neutral |
| Davey | — | — | — | neutral |
| Davies | Tanya Davies | — | — | neutral |
| Davis | Donna Davis | — | — | neutral |
| Dick | Cameron Dick | Cameron Dick | Labor | retained |
| Dillon | Sean Dillon | Sean Dillon | LNP | retained |
| Donnelly | Greg Donnelly | — | — | neutral |
| Dowling | — | Richard Dowling | Labor | retained |
| Doyle | — | — | — | neutral |
| Duniam | — | Jonathon Duniam | Liberal | retained |
| Edwards | Maree Edwards | — | — | neutral |
| Ellis | Fraser Ellis | — | — | neutral |
| Emerson | Thomas Emerson | — | — | neutral |
| Evans | — | Trevor Evans | Liberal | retained |
| Fang | Wes Fang | Wes Fang | Nationals | retained |
| Farmer | De Farmer | — | — | neutral |
| Farrell | — | Don Farrell | Labor | retained |
| Fawcett | — | — | — | neutral |
| Field | Russell Field | Russell Field | LNP | retained |
| Foley | Martin Foley | Martin Foley | — | retained |
| Franklin | Ben Franklin | Ben Franklin | Nationals | retained |
| Gallagher | — | Katy Gallagher | Labor | retained |
| Gardner | J.A.W. Gardner | — | — | neutral |
| Garrett | — | — | — | neutral |
| Gee | — | Andrew Gee | Independent | retained |
| George | — | Jennie George | Labor | retained |
| Gilbert | Julieanne Gilbert | Julieanne Gilbert | Labor | retained |
| Gosling | — | Luke Gosling | Labor | retained |
| Grace | Grace Grace | Grace Grace | Labor | retained |
| Graham | John Graham | John Graham | Labor | retained |
| Grant | Troy Grant | — | — | neutral |
| Green | By Green | — | — | neutral |
| Gregg | — | Matt Gregg | Labor | retained |
| Griffin | James Griffin | — | — | neutral |
| Guy | Matthew Guy | Matthew Guy | — | retained |
| Haines | — | Helen Haines | Independent | retained |
| Halfpenny | Bronwyn Halfpenny | Bronwyn Halfpenny | Labor | retained |
| Hall | Katie Hall | — | — | neutral |
| Hanson | Jeremy Hanson | Pauline Hanson | One Nation | retained |
| Harper | Aaron Harper | Aaron Harper | Labor | retained |
| Harris | David Harris | — | — | neutral |
| Harrison | Jodie Harrison | — | — | neutral |
| Hart | Michael Hart | Michael Hart | LNP | retained |
| Harvey | Richard Manuel Harvey | — | — | neutral |
| Hawke | — | Alex Hawke | Liberal | retained |
| Head | Bryson Head | Bryson Head | LNP | retained |
| Henderson | — | Sarah Henderson | Liberal | retained |
| Hennessy | Jill Hennessy | Jill Hennessy | — | retained |
| Hoare | — | Kelly Hoare | Labor | retained |
| Holland | Michael Holland | — | — | neutral |
| Hood | D.G.E. Hood | — | — | neutral |
| Horne | Melissa Horne | — | — | neutral |
| Howard | Jennifer Howard | — | — | neutral |
| Hughes | Eddie Hughes | — | — | neutral |
| Hunt | Jason Hunt | — | — | neutral |
| Hurst | Emma Hurst | Emma Hurst | Animal Justice Party | retained |
| Hutton | Nigel Hutton | Nigel Hutton | LNP | retained |
| Irwin | — | Julia Irwin | Labor | retained |
| J.M.A. Lensink | — | Michelle Lensink | Liberal | retained |
| Jackson | Rose Jackson | — | — | neutral |
| James | Bree James | — | — | neutral |
| Jenkins | — | Harry Jenkins | Labor | retained |
| Johnson | — | Michael Johnson | Liberal | retained |
| K.J. Maher | — | Kyam Maher | Labor | retained |
| Katter | Rob Katter | — | — | neutral |
| Kelly | Joe Kelly | — | — | neutral |
| Kemp | Michael Kemp | — | — | neutral |
| Kennedy | John Kennedy | Simon Kennedy | Liberal | retained |
| Kerr | — | Duncan Kerr | Labor | retained |
| King | Shane King | — | — | neutral |
| Kirkland | Donna Kirkland | Donna Kirkland | LNP | retained |
| Knight | Sharon Knight | Sharon Knight | — | retained |
| Krause | Jon Krause | Jon Krause | LNP | retained |
| Lane | Jordan Lane | — | — | neutral |
| Latham | — | Mark Latham | Independent | retained |
| Lawrence | — | — | — | neutral |
| Le | — | Dai Le | Independent | retained |
| Leahy | Ann Leahy | Ann Leahy | LNP | retained |
| Lee | Elizabeth Lee | — | — | neutral |
| Liddle | — | Kerrynne Liddle | Liberal | retained |
| Lim | — | — | — | neutral |
| Lindsay | — | Peter Lindsay | Liberal | retained |
| Lister | James Lister | James Lister | LNP | retained |
| Lloyd | — | — | — | neutral |
| Lui | Cynthia Lui | Cynthia Lui | Labor | retained |
| Lynch | Paul Lynch | — | — | neutral |
| MacDonald | Aileen MacDonald | Aileen MacDonald | Liberal | retained |
| Marshall | Steven Marshall | — | — | neutral |
| Martin | James Martin | — | — | neutral |
| McAllister | — | Jenny McAllister | Labor | retained |
| McBride | Nick McBride | Emma McBride | Labor | retained |
| McCarthy | — | Malarndirri McCarthy | Labor | retained |
| McClelland | — | Robert McClelland | Labor | retained |
| McCormack | — | Michael McCormack | Nationals | retained |
| McDonald | — | — | — | neutral |
| McGhie | Steve McGhie | Steve McGhie | Labor | retained |
| McGrath | — | James McGrath | LNP | retained |
| McGuire | Frank McGuire | Frank McGuire | — | retained |
| McKenzie | — | — | — | neutral |
| McKim | — | Nick McKim | Greens | retained |
| McLeay | — | LEO McLEAY | Labor | retained |
| McLeish | Cindy McLeish | Cindy McLeish | Liberal | retained |
| McMahon | Melissa McMahon | Melissa McMahon | Labor | retained |
| McMillan | Corrine McMillan | Corrine McMillan | Labor | retained |
| McMullan | — | — | — | neutral |
| McNamara | — | Karen McNamara | Liberal | retained |
| Millar | Lachlan Millar | Lachlan Millar | LNP | retained |
| Mitchell | — | — | — | neutral |
| Moriarty | Tara Moriarty | Tara Moriarty | Labor | retained |
| Morris | Deborah Morris | — | — | neutral |
| Morton | Kendall Morton | — | — | neutral |
| Moylan | Brendan Moylan | — | — | neutral |
| Mulholland | — | Corinne Mulholland | Labor | retained |
| Mullen | Charis Mullen | Charis Mullen | Labor | retained |
| Munro | Jacqui Munro | Jacqui Munro | Liberal | retained |
| Murphy | — | — | — | neutral |
| Murray | Steve Murray | — | — | neutral |
| Nelson | — | Brendan Nelson | Liberal | retained |
| Neville | Lisa Neville | — | — | neutral |
| Ng | — | Gabriel Ng | Labor | retained |
| Nicholls | Tim Nicholls | Tim Nicholls | LNP | retained |
| Nightingale | Margie Nightingale | Margie Nightingale | Labor | retained |
| Noonan | Wade Noonan | Wade Noonan | — | retained |
| Northe | By Northe | Russell Northe | — | retained |
| O'Byrne | — | Michelle Anne O'Byrne | Labor | retained |
| O'Connor | — | — | — | neutral |
| O'Keefe | — | Neil Patrick O'Keefe | Labor | retained |
| O'Neill | — | — | — | neutral |
| O'Sullivan | — | Matt O'Sullivan | Liberal | retained |
| Orr | Suzanne Orr | Suzanne Orr | Labor | retained |
| Pakula | Martin Pakula | Martin Pakula | — | retained |
| Park | Ryan Park | — | — | neutral |
| Parker | Jamie Parker | — | — | neutral |
| Paterson | — | — | — | neutral |
| Patterson | S.J.R. Patterson | — | — | neutral |
| Pearce | Rhiannon Pearce | — | — | neutral |
| Pearson | Danny Pearson | — | — | neutral |
| Perrett | Tony Perrett | Tony Perrett | LNP | retained |
| Pettersson | Michael Pettersson | Michael Pettersson | Labor | retained |
| Phillips | — | Fiona Phillips | Labor | retained |
| Piper | Greg Piper | — | — | neutral |
| Poole | Janelle Poole | Janelle Poole | LNP | retained |
| Porter | — | Christian Porter | Liberal | retained |
| Powell | Andrew Powell | Andrew Powell | LNP | retained |
| Power | Linus Power | Linus Power | Labor | retained |
| Pratt | Penny Pratt | — | — | neutral |
| Preston | Robyn Preston | — | — | neutral |
| Price | — | — | — | neutral |
| Pugh | Jess Pugh | Jess Pugh | Labor | retained |
| R.I. Lucas | — | Rob Lucas | Liberal | retained |
| Rae | — | Sam Rae | Labor | retained |
| Ray | — | — | — | neutral |
| Read | Tim Read | Tim Read | Greens | retained |
| Reid | — | Gordon Reid | Labor | retained |
| Reynolds | — | — | — | neutral |
| Richards | Pauline Richards | — | — | neutral |
| Richardson | Tim Richardson | Tim Richardson | Labor | retained |
| Riordan | Richard Riordan | Richard Riordan | Liberal | retained |
| Roberts | — | — | — | neutral |
| Robinson | Mark Robinson | Mark Robinson | LNP | retained |
| Rudd | — | Kevin Rudd | Labor | retained |
| Ryall | Dee Ryall | Dee Ryall | — | retained |
| Ryan | — | — | — | neutral |
| S.G. Wade | — | Stephen Wade | Liberal | retained |
| Saunders | Bruce Saunders | — | — | neutral |
| Scarr | — | Paul Scarr | Liberal | retained |
| Sciacca | — | Concetto Antonio Sciacca | Labor | retained |
| Scott | Robin Scott | — | — | neutral |
| Sharpe | Penny Sharpe | Penny Sharpe | Labor | retained |
| Sheldon | — | Tony Sheldon | Labor | retained |
| Shoebridge | — | David Shoebridge | Greens | retained |
| Sidoti | John Sidoti | — | — | neutral |
| Simpson | Fiona Simpson | Fiona Simpson | LNP | retained |
| Singh | Gurmesh Singh | — | — | neutral |
| Small | — | Ben Small | Liberal | retained |
| Smith | Tom Smith | — | — | neutral |
| Spence | Ros Spence | Ros Spence | Labor | retained |
| Steel | Chris Steel | Chris Steel | Labor | retained |
| Stevens | Ray Stevens | — | — | neutral |
| Stewart | — | — | — | neutral |
| Stuart | Maryanne Stuart | — | — | neutral |
| Sullivan | — | Jimmy Sullivan | Labor | retained |
| Swan | — | Wayne Swan | Labor | retained |
| Tanner | — | Lindsay Tanner | Labor | retained |
| Taylor | Jackson Taylor | — | — | neutral |
| Telfer | Sam Telfer | Sam Telfer | Liberal | retained |
| Theophanous | Kat Theophanous | — | — | neutral |
| Thomas | Mary-Anne Thomas | Mary-Anne Thomas | Labor | retained |
| Thompson | Erin Thompson | — | — | neutral |
| Thomson | Marsha Thomson | Marsha Thomson | — | retained |
| Thorpe | — | Lidia Thorpe | Independent | retained |
| Tilley | Bill Tilley | Bill Tilley | — | retained |
| Treloar | Peter Treloar | Peter Treloar | Liberal | retained |
| Tudehope | Monica Tudehope | — | — | neutral |
| Urquhart | — | Anne Urquhart | Labor | retained |
| Walker | — | — | — | neutral |
| Wallace | — | — | — | neutral |
| Walsh | — | — | — | neutral |
| Ward | Vicki Ward | — | — | neutral |
| Ware | — | Jenny Ware | Liberal | retained |
| Warren | Greg Warren | — | — | neutral |
| Washington | Kate Washington | — | — | neutral |
| Waters | — | Larissa Waters | Greens | retained |
| Watson | Anna Watson | — | — | neutral |
| Watt | — | — | — | neutral |
| Watts | Trevor Watts | — | — | neutral |
| Wells | Kim Wells | — | — | neutral |
| Whiteaker | — | Ellie Whiteaker | Labor | retained |
| Whiting | Chris Whiting | Chris Whiting | Labor | retained |
| Wilkinson | Kylie Wilkinson | — | — | neutral |
| Williams | Gabrielle Williams | — | — | neutral |
| Williamson | Richie Williamson | — | — | neutral |
| Wilson | Felicity Wilson | — | — | neutral |
| Wong | — | Penny Wong | Labor | retained |
| Wooldridge | Michael Wooldridge | Michael Wooldridge | Liberal | retained |
| Worth | — | — | — | neutral |
| Young | Rebecca Young | — | — | neutral |
| Zahra | — | Christian John Zahra | Labor | retained |

## Other corrected rows

| Print | Changed fields against main | Resulting alias / party / representation |
|---|---|---|
| Basham | full, party | David Basham; Liberal; Finniss |
| Bob Horne | representation | Labor; Paterson |
| Bronnie Taylor | representation | New South Wales |
| Buckingham | full, party | Jeremy Buckingham; Legalise Cannabis |
| Butcher | full | Glenn Butcher; Labor |
| Buttigieg | party | Mark Buttigieg; Labor |
| C. Bonaros | full | Connie Bonaros |
| Cheeseman | party | Darren Cheeseman; Independent |
| D O'Brien | full, party | Danny O'Brien; Nationals |
| D O’Brien | full | Danny O’Brien; Liberal |
| D.G.E. Hood | full | Dennis Hood |
| D.W. Ridgway | full | David Ridgway; Liberal |
| David Kemp | representation | Liberal; Goldstein |
| Doolan | full | Ariana Doolan; LNP |
| D’Ambrosio | full | Lily D'Ambrosio; Mill Park |
| E.S. Bourke | full | Emily Bourke; Labor |
| Enoch | full | Leeanne Enoch; Labor; Algester |
| F. Pangallo | full | Frank Pangallo |
| Fentiman | full | Shannon Fentiman; Labor; Waterford |
| Fowles | party, representation | Will Fowles; Independent; Ringwood |
| Fregon | party, representation | Matt Fregon; Labor; Ashwood |
| Furner | full | Mark Furner; Labor; Ferny Grove |
| Hamer | party | Paul Hamer; Labor; Box Hill |
| Hatcher | full | Kendall Hatcher; LNP; Caloundra |
| Higginson | party | Sue Higginson; Greens |
| Hockey | full | Joseph Benedict Hockey; Liberal |
| I. Pnevmatikos | full | Irene Pnevmatikos; Labor |
| I.K. Hunter | full | Ian Hunter; Labor |
| Ingrid Stitt | representation | Western Metropolitan |
| J Bull | full | Josh Bull; Labor |
| J.A. Darley | full | John Darley; Independent |
| J.E. Hanson | full | Justin Hanson; Labor |
| J.S. Lee | full | Jing Lee; Liberal |
| Kempton | full | David Kempton; LNP; Cook |
| Kernot | full | Cheryl Kernot; Labor; Dickson |
| Lambie | party | Jacqui Lambie; Jacqui Lambie Network |
| Linard | full | Leanne Linard; Labor |
| Lynda Voltz | party, current, party_now, representation, affiliations | Labor; Auburn; New South Wales |
| M O'Brien | full | Michael O'Brien |
| M O’Brien | full | Michael O'Brien; Liberal |
| M.C. Parnell | full | Mark Parnell; Greens |
| Maas | party | Gary Maas; Labor; Narre Warren South |
| Macklin | full | Jennifer Louise Macklin; Labor |
| Mark Latham | party, parties, current, party_now, representation, affiliations | Independent; New South Wales; Werriwa |
| Melissa Horne | party | Labor; Williamstown |
| Michael Lee | representation | Labor; Dobell |
| N.J. Centofanti | full | Nicola Centofanti; Liberal |
| Newbury | party | James Newbury; Liberal; Brighton |
| Payman | party | Fatima Payman; Australia's Voice |
| Perera | full | Jude Perera; Cranbourne |
| R Smith | full | Ryan Smith |
| R.A. Simms | full | Robert Simms; Greens |
| R.P. Wortley | full | Russell Wortley; Labor |
| Richmond | full | Luke Richmond; Labor; Stafford |
| Ripoll | full | Bernard Fernando Ripoll; Labor |
| Ros Spence | affiliations | Kalkallo; Yuroke |
| Rowswell | party | Brad Rowswell; Liberal; Sandringham |
| S.E. Close | full | Susan Close; Labor |
| Scanlon | full | Meaghan Scanlon; Labor |
| Settle | party, representation | Michaela Settle; Labor; Eureka |
| Staley | full | Louise Staley; Ripon |
| Sterle | full, party | Glenn Sterle; Labor |
| Stoker | full | Amanda Stoker; LNP |
| T Bull | full | Tim Bull; Labor |
| T Smith | full | Tim Smith |
| T.A. Franks | full | Tammy Franks; Greens |
| T.J. Stephens | full | Terence Stephens; Liberal |
| T.T. Ngo | full | Tung Ngo; Labor |
| Tollner | full, party | David William Tollner; CLP |
| Vallence | party | Bridget Vallence; Liberal; Evelyn |
| Weir | full | Pat Weir; LNP; Condamine |

## Exact dry-run operations

| Action | Slug | Profile |
|---|---|---|
| retire | `roster-profile-04c84a8e2e2f51f3` | Watt — recorded representation |
| replace | `roster-profile-068c04a64f4d6d0a` | Fregon — recorded representation |
| replace | `roster-profile-0cc4b1dc91bcb587` | Connolly — recorded representation |
| replace | `roster-profile-128b2a6b11a74ecc` | Richmond — recorded representation |
| replace | `roster-profile-14429d05ad173a03` | Hatcher — recorded representation |
| create | `roster-profile-14f3eccd711e688c` | St Clair — recorded representation |
| replace | `roster-profile-1745992a04e3a825` | McGhie — recorded representation |
| replace | `roster-profile-24a352af0cebeb26` | Mark Latham — recorded representation |
| retire | `roster-profile-25c7e17d3e9906a3` | Hall — recorded representation |
| replace | `roster-profile-2823576859b5816a` | Allan — recorded representation |
| replace | `roster-profile-2a9c84d0208e5425` | Blandthorn — recorded representation |
| retire | `roster-profile-2d1e830624b2572a` | Ryan — recorded representation |
| retire | `roster-profile-3228d821dcaa680d` | Patterson — recorded representation |
| retire | `roster-profile-332e04b724b0a984` | Wells — recorded representation |
| replace | `roster-profile-38592d0cc9b36019` | Hamer — recorded representation |
| retire | `roster-profile-3a57aaa983f63746` | Garrett — recorded representation |
| replace | `roster-profile-3c237edf766933af` | Richardson — recorded representation |
| replace | `roster-profile-4008f1ed47469d0b` | Perera — recorded representation |
| replace | `roster-profile-4b54a74d0bc58377` | Staley — recorded representation |
| replace | `roster-profile-51389ddc33bbe1a8` | Tilley — recorded representation |
| retire | `roster-profile-53b67882d1ef765c` | Hood — recorded representation |
| replace | `roster-profile-55fb96bf33f19ca5` | Guy — recorded representation |
| replace | `roster-profile-59b31e31f2108026` | Rowswell — recorded representation |
| replace | `roster-profile-5dfcf9ef1fb1ecbc` | Thomas — recorded representation |
| replace | `roster-profile-60ebd6bcc7db69e6` | Kilkenny — recorded representation |
| create | `roster-profile-61f609aa31a0d657` | Rattenbury — recorded representation |
| create | `roster-profile-654f4c67d878e078` | Zahra — recorded representation |
| replace | `roster-profile-671937d5fbe84833` | Enoch — recorded representation |
| replace | `roster-profile-6b2f9cafe62cf707` | Addison — recorded representation |
| retire | `roster-profile-6bb48cc5c7864234` | Richards — recorded representation |
| retire | `roster-profile-6e8d8801f51aafe8` | Williams — recorded representation |
| retire | `roster-profile-722b84aa2c4f6162` | Scanlon — recorded representation |
| replace | `roster-profile-7479e3a2fd685227` | D'Ambrosio — recorded representation |
| create | `roster-profile-74ae65435bc77f11` | Shaun Leane — recorded representation |
| replace | `roster-profile-76df69fa9d736283` | Carroll — recorded representation |
| retire | `roster-profile-7d12edc0aac210e0` | Linard — recorded representation |
| retire | `roster-profile-7f2cc2d8db905052` | Morris — recorded representation |
| replace | `roster-profile-7fe5df9caca67218` | Sullivan — recorded representation |
| replace | `roster-profile-813f46eed45decb5` | Brooks — recorded representation |
| replace | `roster-profile-8188fe38fdd1502d` | Lynda Voltz — recorded representation |
| replace | `roster-profile-845666d5a05426ab` | Hibbins — recorded representation |
| retire | `roster-profile-88f7d9080f5b37ab` | Gardner — recorded representation |
| retire | `roster-profile-915ea74ac01cd10e` | Andrews — recorded representation |
| retire | `roster-profile-9230ee73603d65a6` | Worth — recorded representation |
| replace | `roster-profile-95550208e7bac16e` | Pallas — recorded representation |
| replace | `roster-profile-95e178b51ca9d858` | Basham — recorded representation |
| replace | `roster-profile-a0c79a8531e1feaa` | Settle — recorded representation |
| replace | `roster-profile-a31537a34670a046` | Fentiman — recorded representation |
| create | `roster-profile-a7087476b5c7c2cd` | Sciacca — recorded representation |
| replace | `roster-profile-a78fb093d48ed1b1` | Couzens — recorded representation |
| replace | `roster-profile-a9a96d230d00826a` | Weir — recorded representation |
| replace | `roster-profile-a9cafd60efe1a190` | Latham — recorded representation |
| replace | `roster-profile-b1284448f3eb6388` | Bob Horne — recorded representation |
| retire | `roster-profile-b1f74ef7ff3e7dfa` | Pearson — recorded representation |
| replace | `roster-profile-b298db0cbdbcbdfc` | Vallence — recorded representation |
| retire | `roster-profile-b311172dd9a45edf` | Ward — recorded representation |
| retire | `roster-profile-b530fac09ea738e2` | Horne — recorded representation |
| replace | `roster-profile-b7d8971fd7089472` | J.M.A. Lensink — recorded representation |
| replace | `roster-profile-bb1d48311506ab2c` | Ingrid Stitt — recorded representation |
| retire | `roster-profile-bbacffd9bc261704` | Cox — recorded representation |
| retire | `roster-profile-bca5db1840b734ed` | Brereton — recorded representation |
| replace | `roster-profile-c2d863c63fc32b41` | Bronnie Taylor — recorded representation |
| replace | `roster-profile-c37367a58a26cba7` | Suleyman — recorded representation |
| retire | `roster-profile-c43139196d576427` | Charles — recorded representation |
| replace | `roster-profile-c85428c6a27782f3` | Maas — recorded representation |
| replace | `roster-profile-c8bb89897f65c66c` | Fowles — recorded representation |
| replace | `roster-profile-c8d5b8aeb343f95f` | Carbines — recorded representation |
| replace | `roster-profile-c9543cb5532d27ac` | Edbrooke — recorded representation |
| replace | `roster-profile-ccc302efb18c3ffc` | Kempton — recorded representation |
| replace | `roster-profile-cdab02bff6d7f4b4` | Staikos — recorded representation |
| retire | `roster-profile-ceb32b93931ce2ef` | Bailey — recorded representation |
| replace | `roster-profile-d394e2a4020b802e` | Newbury — recorded representation |
| replace | `roster-profile-d43974c13c6b3fb5` | David Kemp — recorded representation |
| retire | `roster-profile-d486dfbd5fb57834` | Green — recorded representation |
| replace | `roster-profile-d4c73fc7bf88b45f` | Northe — recorded representation |
| create | `roster-profile-d6098b0174e62780` | O'Byrne — recorded representation |
| replace | `roster-profile-d73e9a3c865c8158` | Ros Spence — recorded representation |
| replace | `roster-profile-d80f3e7b13b303ec` | Michael Lee — recorded representation |
| retire | `roster-profile-d85eb74fd75da1bc` | Butcher — recorded representation |
| retire | `roster-profile-dc01da548cb3a5f7` | Farmer — recorded representation |
| replace | `roster-profile-dc324fd4f6a5ebdc` | Kernot — recorded representation |
| replace | `roster-profile-e1ee9d20d2336e24` | Hutchins — recorded representation |
| replace | `roster-profile-e76852d73fd15af8` | Furner — recorded representation |
| replace | `roster-profile-e778a928dde64186` | Sandell — recorded representation |
| replace | `roster-profile-ec33cf403b166c62` | Battin — recorded representation |
| replace | `roster-profile-f0d4afea2ae88330` | Pesutto — recorded representation |
| replace | `roster-profile-f10c3dd20768dbfa` | D’Ambrosio — recorded representation |
| replace | `roster-profile-f17a23da8c159549` | Dimopoulos — recorded representation |
| replace | `roster-profile-f2dd86e34cc18d36` | Burgess — recorded representation |
| replace | `roster-profile-f3cdc1043ba7dd24` | Crawford — recorded representation |
| replace | `roster-profile-f66c37bba249563d` | McLeish — recorded representation |
| retire | `roster-profile-fdd571b8488fd086` | Theophanous — recorded representation |
