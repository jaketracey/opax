# OPAX mobile tap sweep

Date: 11 November 2026. Branch: `ad/tap-sweep`.

## Result and method

**36 findings: 25 fixed, 11 left for Jake.** Counts are logical issues in the table, rather than the number of controls rendered from a shared row. The separate Search speech lane is recorded under J01 and was not duplicated.

This was a source and fixture audit, read-only before implementation. No simulator or device was run. All 228 feature TSX files were scanned for record rows, named text, tags, source links, actions and stats. The initial scan found 284 uses of the requested row families. Shared primitives and record-bearing callers were then traced to their route helpers, loaders, decoders and destination screens. This establishes the JavaScript navigation contracts, not native touch or VoiceOver behaviour on hardware.

The primitive review covered `rows.tsx` (`RecordRow`, `LinkRow`, `BillRow`, `DivisionRow`, `MoneyRow`, `ValueRow`, suggestion rows), `people.tsx` (`PersonRow`, `PartyLabel`), `record.tsx`, `labels.tsx`, `row-link.tsx`, card and section-header link hosting, and the feature-level `RecordRow.tsx` adapter. RecordRow's speaker slot was read but not changed.

Data evidence included the pinned electorate manifest, people, roster, elections, recent interests and recipient shards; the committed search and record contract fixtures; and the public program, largest-grant, agency and Time Machine exports. Decoder checks included `catalog-decoders.ts`, `record-policy.ts`, Ask `decodeAnswer`, Search summary contracts, `money-public/data.ts`, the recipient-shard decoder and `people/model.ts`. No live API freshness claim is made.

## Fixed findings

| ID | Screen | Element and what it shows | Where it should go | Cause | Fix status |
| --- | --- | --- | --- | --- | --- |
| F01 | People, directories, bill sponsors, election candidates, Ask people and other PersonRow callers | Current and previous party names | The named party | PersonRow suppressed party touch; previous party only had an accessibility action | fixed: inline party links stop propagation; existing row accessibility actions remain; raw codes use the existing party-code mapping |
| F02 | Bills, Today bills and reader bill rows | Sponsor's party | Party record | BillRow forced a decorative PartyLabel | fixed: nested link and grouped-row accessibility action |
| F03 | Ask cited/found records and citation Open record | Source title | Native record reader or other recognised native route | Absolute OPAX URLs were rejected; empty hrefs with public slugs/resources were not repaired; a conflicting saved slug could replace the linked speech | fixed: validated OPAX URL handling through existing route helpers; public slug fallback; href identity wins; citation passage retained |
| F04 | Ask source rows | An original represented only by an external href | Published source | Fallback opened only `source.url`, which need not exist | fixed: existing answer-link opener handles the available href |
| F05 | Ask answer rows, excerpts, sources sheet and iPad sources | Speaker name | Verified person record | CitedRecordRow drew plain speaker text despite an available profile map | fixed: pass existing profiles into the rows; nested name link and accessibility action; unresolved speakers remain text |
| F06 | Ask cited/found source rows | Party name beside speaker | Party record | Explicit decorative label | fixed: independent party link and accessibility action |
| F07 | Ask iPad sources pane | Source rows, keyboard activation and Open record | Same repaired record as on phone | Pane callbacks reused the raw href rather than the repaired document identity | fixed: shared source-path repair for every pane opening path |
| F08 | Search speech summary | Inline citation numbers | Each cited speech | Numbers were styled text; only accessibility actions opened them | fixed: each number has a link role, label and handler |
| F09 | Search speech summary | Records cited rows with query/fragment hrefs | Reader | Direct resolver did not retry the document path without the query/fragment | fixed: shared record resolver; source row and inline citation agree |
| F10 | Topics index | Topic with zero labelled speeches | Existing topic screen | Zero-count branch omitted href | fixed: same topic route and chevron as other topic rows |
| F11 | Topic details | Donations by named party | Party record | ValueRow had no href | fixed: partyRoute on each party row |
| F12 | Grant agreement | Program fact | Grant program | Fact model could not carry a destination | fixed: decoded program ID and jurisdiction passed to ValueRow href |
| F13 | Largest grant agreement | Resolved program fact | Grant program | Known grants-index program was linked only in a separate onward section | fixed: fact itself carries the resolved program route; unmatched names stay plain |
| F14 | Government contract | Agency fact | Agency record | Fact discarded the known agency ID | fixed: agencyRoute from the loaded profile |
| F15 | Recipient award opened without a program key | Named recipient | Recipient money record | Recipient-shard view always returned an empty onward list | fixed: Open recipient row uses the existing recipient ID and jurisdiction; private individuals get no link |
| F16 | Today declarations | Member name | Person record | Entire card opened the declarations feed even when profileSlug was available | fixed: independent member link plus grouped accessibility action; card still opens the feed |
| F17 | Today declarations | Party name | Party record | Decorative PartyLabel | fixed: nested link plus grouped accessibility action |
| F18 | Your MP and Today member hero | Party name | Party record | Only an accessibility action opened the party | fixed: touch link uses the same destination |
| F19 | Electorate election rows | Winner name | Verified person | Winner had a person ID but the loaded directory was not used | fixed: existing representativeProfile join, independent name link and row action |
| F20 | Electorate election rows | Winner's party | Party record | Decorative PartyLabel | fixed: nested party link and row action |
| F21 | Your MP electorate card | Election winner | Verified person | Card had the election result but no directory input for its existing identity join | fixed: pass already-loaded directory; name link and card action; no extra request |
| F22 | Your MP electorate card | Winner's party | Party record | Party was only part of the electorate card's press target | fixed: independent party link and card action |
| F23 | Electorates directory | Single representative's party | Party record | Label was decorative inside the electorate link | fixed: independent party link and row action; split selection is not fired |
| F24 | Time Machine voices | Party under a speaker without a profile join | Party record | Fallback branch disabled the party along with the unresolved person | fixed: independent party link and grouped accessibility action; person remains unlinked without a verified match |
| F25 | Just declared feed | Organisation matched to an AEC donor | Donor money record | Plain tie text ignored the decoder's donor_id | fixed: link uses the published donor node ID; menu/accessibility action also opens it; unmatched ties remain plain |

Every new target has an accessibility role and label. Links inside grouped rows also have an action on the accessible row/card. Nested text links stop event propagation. Existing chevrons are used on whole-row links; nested names use the existing link colour. No private-person identity is inferred from a name.

## Left for Jake, list only

| ID | Screen | Element and what it shows | Where it should go | Cause | Fix status |
| --- | --- | --- | --- | --- | --- |
| J01 | Search speech rows and shared RecordRow callers, including bill/topic/reader speeches | Speech title, speaker photo/name/party | Reader/person/party | The Search speech files and shared speaker slot belong to `ad-tf-AMjhiR6m`; absolute href decoding is also owned there | left for Jake: reconcile that lane, then check all shared speaker-slot callers; no changes made to its files or slot |
| J02 | Bills/Today/reader BillRow metadata and the loading bill header | Sponsor names | Verified person | Index metadata carries a printed name, not the detail screen's verified sponsor directory join; private/member sponsors can be ambiguous | left for Jake: supply the existing verified sponsor identity at these surfaces; loaded BillDetail sponsor rows already link |
| J03 | Electorate directory and Search seat secondary lines | Representative names | Verified person | These lightweight surfaces do not load the full directory identity join; a release person ID alone does not establish a supported roster profile | left for Jake: decide whether to provide/cache that identity map; do not guess profile slugs |
| J04 | Seat chooser | Member/party secondary text | Person/party, if independently selectable | The primary row saves a seat and closes a sheet; secondary navigation needs a deliberate chooser interaction | left for Jake: design decision about secondary links while choosing/saving a seat |
| J05 | Edition cover/plate | Party and place embedded in a formatted identity/kicker line | Party/electorate | Cover opens the edition story and its identity line is formatted prose, without independent destinations | left for Jake: decide cover sublinks and provide a structured place identity; the story's main subject row already opens its record |
| J06 | Edition Sources without a matched original; Coverage by source; hash-only Ask sources | Named source or citation | Published original/dataset | Edition sourceRows and corpus coverage sources can contain only a name/date/coverage string, without a URL; an opaque Ask resource hash cannot be turned into a public reader slug | left for Jake: add explicit source URLs or dataset IDs; existing originals continue to open |
| J07 | Interests, interest-detail lists and declaration matches without donor_id | Companies and other named entities in the member's words | Confirmed donor/supplier/entity where a match exists | Most register entries are free text; non-donor tie rows have no destination identity | left for Jake: source-backed entity joins or a design for links in quoted register text; donor_id cases are F25 |
| J08 | Party debts | Named creditors | Confirmed entity record | Debt decoder's top rows contain name, amount and type only | left for Jake: creditor identity data; a similar name is insufficient |
| J09 | Party meetings/lobbying and person diary | Minister, firm and organisation names | Verified person/entity | Access rows have printed names and dates rather than verified profile/entity destinations | left for Jake: provide identity bridges; keep the dated source links |
| J10 | Money grant/evidence/award metadata and donor public-money top lists | Grant agency, seat, unmatched program, award recipient, From/To names and top agency labels | Corresponding agency/electorate/program/entity | These remaining shapes carry names or `[label, amount]`, not the destination IDs required by the existing screens | left for Jake: enrich or join the relevant exports; known program/agency/recipient cases are F12 to F15 |
| J11 | Person topic rows outside the supported topic catalogue | Topic label and share | Topic screen | Some topic slugs are not in the supported page topic map | left for Jake: expand topic definitions/data or choose a search fallback; supported topics already link |

## Reviewed cases that are not bugs

| Screen/family | Element and what it shows | Where it goes or why it stays plain | Cause/check | Fix status |
| --- | --- | --- | --- | --- |
| Shared LinkRow, ValueRow and MoneyRow | Named record and trailing value | Supplied href through RowLink, or explicit external opener | Resolvers and accessibility hosting traced; plain numeric ValueRows have no record identity | not a bug: navigation exists when supplied |
| Shared feature RecordRow adapter | Record title and detail | Required onPress | Handler is mandatory and passed through | not a bug |
| Today | Bill, vote, followed item, featured person, Your MP and exploration cards; See all actions | Existing bills, bill division, follow, person, seat and list routes | Callers pass routes or explicit handlers | not a bug, apart from fixes listed above |
| Edition | Cover title, story subject, sourced original rows | Edition story, subject record and original source | Existing card/row links; politician identity resolves through its loader | not a bug; remaining metadata is J05/J06 |
| Person and party | Stats for votes, interests, pay, members and receipts | Existing section jumps | Enabled tiles have onPress; unlinked data is explicitly unavailable | not a bug |
| Remaining stats | Census population, monetary totals, quiz best/last score and lead totals | Stay as values | No individual record is named; the rule permits plain counts and amounts | not a bug |
| Bills | Loaded sponsor rows, related bills, acts, bill text and speeches | Person/party/bill/reader/original routes | Existing sponsor identity guard and native/source handlers | not a bug; shared speaker text remains J01 |
| Bill stages | Reading/stage, house and date | Stay as history values | Stage decoder holds stage, house and date, not a separate record identity | not a bug: no inert named member/mover record in these rows |
| Divisions/votes | Division rows, party splits and Your MP vote | Expand recorded question/party votes; party and member links | Existing expansion handlers, bill division routes and explicit source links | not a bug; there is no full individual voter list currently rendered in mobile |
| Committees | Committee references in source records | Existing reader/original where a link is published | No standalone committee detail/member screen or committee member-list UI exists in this mobile tree | not a bug in an existing mobile row; a new committee surface requires a separate decision |
| Money map | Focused entity title, Open record, flows and associated-entity source | Party/money record and AEC original | `moneyMapEntityRoute`, flowRecord and source handlers already exist | not a bug |
| Money | Donors, associated entities, recipients, suppliers, programs, agencies, contracts, grants, connections and lead evidence | Existing money-record/item, program, agency, connection or source routes | Followed record builders through decoders and available IDs | not a bug apart from F12 to F15/F25 and J10 |
| Interests and expenses | Category disclosures, More, dated originals, salary and expense breakdowns | Expand details, originals or existing expense glossary | Plain years, categories and amounts are values; no separate expense-record screen is being omitted | not a bug; named entities without identities are J07 |
| Reader and records | Speaker profile when joined, bill link, related records, recent records, citation formats and originals | Existing native record/person/bill routes and browser | Record slug policy and fallback source handling checked | not a bug; unresolved witnesses are not assigned a parliamentarian's page |
| Ask/Talk | Inline answer citations, people mentioned, people disclosure, original source buttons and Talk source rows | Citation sheet/pane, person, source or Talk record handoff | Existing actions; voice external sources intentionally wait until an active call ends | not a bug, apart from F03 to F07 |
| Search non-speech groups | People, parties, seats, bills, topics and register groups; See all | Existing routes, split selection or explicit browser opening | Group/suggestion/result callers traced; original Search lane exclusions respected | not a bug apart from F08/F09 and J01/J03 |
| Explore, follows and leads | Named records, quiz review sources, photos and links in lists | Existing record routes, filters or sources | Primary row actions exist; filter labels select a filter rather than a record | not a bug, apart from F24 |
| Sources, methods, account, community, welcome and sheets | Original/dataset links, account actions and ordinary explanatory text | Existing link/actions or plain explanatory text | No additional unsupported record target identified; launch/splash and navigation chrome were not edited | not a bug |

## Verification

Route tests exercise decoded saved answers with absolute OPAX URLs, missing hrefs, public resource slugs, conflicting saved slugs, query/fragment paths, raw party codes, non-public hashes, external hosts and unresolved identities. Component tests assert destinations, link roles/labels, grouped accessibility actions and stopped event propagation. Public-money tests use committed program/agency/largest exports and pinned recipient shards. Electorate and declaration tests use the pinned records and real identity joins.

Gates from `mobile/`:

- `npx tsc --noEmit`: passed.
- `npm run -s lint`: passed with three existing warnings in donor-privacy, money-filter-navigation and record-link-hermes tests; no new warnings.
- Touched and affected tests: 14 suites passed, 745 tests passed, including fixture startup and the affected leads/design-component regressions. The suites are `ask-answer-design`, `ask-rows-source-route`, `electorate`, `money-public-screens`, `recipient-grant`, `row-link-accessibility`, `search-summary-scope`, `topics`, `tap-sweep-links`, `fixture`, `leads`, `design-components`, `year-pictures-ui` and `bill-sponsor-rows`.
- `npm test -- --silent`: passed, 325 suites passed and one skipped; 7,806 tests passed and four skipped (7,810 total), 261.255 seconds.
- `git diff --check`: passed.

Diagnostic full runs exposed regressions, all corrected: standalone party labels retain their original colour, donor match lines retain their complete readable text, and unresolved people retain their grouped accessible name/context with a party action. The fixture startup also repeatedly exceeded its 15-second readiness limit. A direct run reached readiness at 13.69 seconds, so readiness now has a 30-second bound and startup tests a 40-second bound. HTTP limits and all response assertions are unchanged. The diagnostic full runs were stopped after these failures; only the final complete run is the gate result.

No simulator/device run, push, rebase or merge was performed.
