# Catalog loss policy

Optional null fields are missing. Required containers and structural keys still fail validation. Independent malformed records can be omitted only within the loss budget; failures retain the last good cached bytes and original source/save dates.

The budget is `max(1, floor(input rows / 100))`. A nonempty collection losing all its rows always fails. The one-row allowance keeps isolated errors tolerable in small catalogs; the 1% limit prevents a renamed or retyped field from silently replacing the cache with a substantially truncated catalog. Schema, duplicate and identity losses in the same collection share the budget. Valid empty collections stay valid. Strict collections have no loss allowance.

Partial status is held outside published data in weak metadata, propagated to the decoded root, and exposed as `RecordResult.partial`. Cached raw bytes are decoded again after relaunch, so the status cannot be lost on disk. Follows excludes every partial source: unavailable markers are omitted and the saved fingerprint is preserved. A voting name bridge referencing a rejected row is removed whole, never shortened to a subtotal.

## List audit

| Decoder / collection | Policy and reason |
| --- | --- |
| Roster people | Bounded row loss and partial notice. A person's representation list stays whole; one bad observation removes that person rather than inventing a shorter history. |
| Manifest sources, files, coverage and dates | Strict structural release, attribution and coverage. |
| People directory | Bounded whole-person loss; electorates and periods within a person are strict. All copies of a duplicated person ID are omitted. |
| Seat index | Bounded whole-seat loss; representatives are strict inside each seat. All copies of a duplicated seat ID are omitted. Your MP marks partial coverage; party membership counts require complete directory sources. |
| Seat detail | Strict representatives, boundaries, elections/candidates/votes, census vintages, relations, rosters, terms, identities and citations. Missing rows could select the wrong latest fact, change representation or remove attribution. |
| Bill index | Bounded whole-bill loss, flagged to readers and excluded from Follows. |
| Bill detail | Strict dates, relationships, sources, divisions, speeches and acts: coherent timeline and evidence. |
| Votes | Bounded whole vote-record/name-entry loss. Nested vote lists and years are strict; all records for a name must survive together before any total is calculated. Broken references to an absent raw key fail the file. |
| Interest index | Bounded independent name/holder entries, with partial provenance and no Follows comparison. |
| Interest detail | Strict categories, items, ties, flows and register evidence: declared counts cannot accompany truncated lists. |
| Recent interests | Bounded independent declarations with a partial notice. Each declaration's ties remain strict. |
| Interest ties by donor | Bounded whole-donor loss; a donor's declaration/evidence list is strict. |
| Pay | Strict base series, offices, current cohort, people, spells, yearly amounts, sources and coverage limitations. Name lookup entries may be omitted with partial provenance. Never substitute an older base salary or recalculate a cohort after loss. |
| Expenses | Strict people, categories, years and top entries: complete benchmark cohort and per-person totals. Name lookup entries may be omitted with partial provenance. |
| Expense definitions | Strict groups and categories: do not mislabel a recorded category. |
| Photo people / credits | Bounded independent lookup loss; an uncredited or unlinked portrait stays hidden. |
| Money | Strict nodes, edges and yearly amounts: rankings, donor top lists and graph totals require the complete cohort. |
| Corpus | Strict source coverage, counts and limitations. |
| Discovery | Bounded whole-signal loss with unreadable count and partial status; metrics, participants, evidence and caveats remain strict. |
| Search | Bounded independent result loss and partial notice; structural pagination and published total stay intact. |
| Edition | Strict slides and source rows: retain the whole posted context, cover and attribution. |
| AEC extras | Bounded whole-party loss; associated entities inside a party are strict against the published total. |

Saved-copy UI distinguishes unreadable exports from offline reads. Source and saved dates are unchanged. Optional nulls do not mark a file partial, and valid catalogs keep their existing behavior.

The small-state stores retain the reviewed two-slot save pattern. `api/disk-store.ts` remains unchanged: an absent download-cache entry can be fetched again. Recovery of orphan `.tmp` files from old internal TestFlight saves remains optional and is not implemented; only validated committed slots participate in the new save format.

Permanent regressions in `mobile/tests/robustness-review.test.tsx` cover review R1–R5 (including R1b), the budget boundary, duplicate ambiguity, cache/relaunch metadata, Follows preservation, strict factual lists and UI copy. The small-state mock permits legacy setup saves and models destination deletion when its interrupted move is armed.
