# Bill sponsor merge-forward, row 183, 14 November 2026

Inputs: branch `638a9b8f93e61107e852f6b450ca810f8c93b105`; fetched main `9fc487882701b3745c1e209836c75416f95fe770`.
Main includes #365, #366, #367, #368, row 172 (#369) and row 174 (#371). Rows not on that main were not imported.
The original [52-case audit](2026-11-14-bill-sponsor-parties.md) remains a historical snapshot of the earlier base.

## Consolidated contract

There is one `fill_sponsor_parties(bills, timeline=None, evidence=None, *, records=None) -> list[dict]` implementation. Positional Evidence, `evidence=` and explicit `records=` use the same resolver, mutation and held-disagreement path. Supplying both evidence and records fails explicitly. The build still supplies database-enriched Evidence; the retained refresh still supplies `evidence=` and consumes the returned holds. The audit projection supplies `records=`.

A fresh build validates both evidence loaders before resolving or publishing. An explicit Records projection also aborts on an unavailable electorate release or Senate Handbook. A retained refresh supplied with frozen Evidence keeps the published labels and source stamp. Missing, conflicting and reviewed held periods keep their source labels. A pid cannot correct a party without a matching printed surname, while blank labels can still be filled. The timeline remains a fallback only for missing parties.

The uniform own-registered-party rule, regional registered-party rule and reviewed renames share this path. The four Patrick source-party/Independent disagreements remain returned holds: s1297, s1307, s1316 and s1321. No Rex Patrick Team foundation date is inferred. The earlier invented personal-party fixture now explicitly maps that invented holder as its owner; its original expected hold and retained-refresh assertions are preserved.

## Every projection difference from reviewed main

The read-only projection checks all 2,989 detail records, all primary sponsors and every co-sponsor. It changes exactly two primary parties and zero co-sponsors. There are no additional blank-party fills or identity changes.

| Bill | Introduced | Reviewed published label | Projected label | Held evidence |
| --- | --- | --- | --- | --- |
| au-federal-s1309, Sam McMahon | 2021-08-04 | Nationals | Country Liberal Party | `scripts/handbook_party_service.json`, pid 10948, has Nationals from 2019-05-18 to 2022-04-07. `scripts/roster_accept.json`, Sam McMahon, explicitly registers Country Liberal Party. The regional rule selects that registered label only within a covering period whose label is a variant; it invents no date. |
| au-federal-s1127, Rex Patrick | 2018-05-09 | Nick Xenophon Team | Centre Alliance | `scripts/roster_accept.json`, party-period renames, dates Centre Alliance from 2018-04-10 using the held Handbook records for Griff and Patrick. `vote_parties.dated_name` applies that reviewed boundary. |

Of row 172's 52 reviewed disagreements, 48 were published corrections and four were retained holds; its two additional blank-party fills stay in place. The only change within that 52-row decision map is s1309. s1127 is an additional naming variant outside the map, covered by the full projection test. The initial lane's 47 affiliation-change and five naming classifications remain in the historical audit; row 172's correction count also includes McMahon's source Liberal to dated Nationals decision.

Public bill records, the published decision fixture and roster identities are retained byte-for-byte from fetched main. The nightly remains responsible for regeneration: `scripts/vm/nightly.sh` sources and calls `bills_refresh`, `scripts/vm/bills_refresh.sh` invokes `scripts/refresh_bills.sh`, and that script runs `scripts/export_bills.py --out portal/public/bills`. No nightly or database export was run here.

## Counts and named deltas

| Party | Before row 172 | Published after row 172 | Row 183 next-export projection | Recorded members, published and projected |
| --- | ---: | ---: | ---: | ---: |
| Nick Xenophon Team | 7 | 22 | 21 | 5 |
| Palmer United Party | 4 | 3 | 3 | 4 |
| Rex Patrick Team | 4 | 4 | 4 | 0 |

Row 172 moves 15 Xenophon bills from Independent to NXT and Lambie's s989 from PUP to Independent. Row 183 moves s1127 from NXT to Centre Alliance, so NXT's newest bill changes from Defence Amendment (Sovereign Naval Shipbuilding) Bill 2018 to Banking Amendment (Rural Finance Reform) Bill 2018. The published test keeps the former title and the projected test asserts the latter. The member and server-disclosure tests retain NXT 5, PUP 4 and Rex Patrick Team 0; only the last has the no-members disclosure.

Relative to reviewed main, the other primary-party totals are Centre Alliance 45 to 46, Nationals 27 to 26, and Country Liberal Party 1 to 2. Total bills remain 2,989. Row 174 changes held SA Council evidence; it causes no sponsor-projection delta. Row 172 also adds Glenn Lazarus Team to the party-member graph. The pre-merge local crawl sitemap still had 28 parties; rebuilding it includes that reviewed identity and brings it to the canonical directory count of 29.

## Conflict resolutions

| Hunk | Resolution |
| --- | --- |
| party-bills H1 | Keep the shipped-index test and add a separate in-memory next-export test. |
| party-bills H2 | Assert published NXT/PUP/Rex bill counts 22/3/4, projected 21/3/4, and members 5/4/0 in both. |
| party-bills H3 | Preserve published graph/index equality and member identities; check the projected titles and conditional no-members disclosure separately. |
| portal-facts H1 | Retain the earlier dated decision map and add the explicit Records projection. |
| portal-facts H2 | Assert the exact published decision or original source canonical label, plus the separate next-export canonical label. |
| export_bills H1 | Consolidate Evidence and explicit Records into one bounded resolver contract returning held disagreements. |
| export_bills H2 | Preserve primary sponsor identity fallback and build/refresh Evidence callers; strict fresh publication aborts on missing evidence. |
| export_bills H3 | Resolve every subsequent co-sponsor, retain the first sponsor's primary decision, and return/log the four held naming disagreements. |
| sponsor-tests H1 | Retain both suites as RetainedDatedSponsorParties and PublishedDatedSponsorParties, adding contract parity and frozen-refresh checks. |
| exporter-facts H1 | Preserve raw token decoding and exact published decisions independently of projected fixture values. |
| exporter-facts H2 | Add next-export assertions, the reviewed-map invariant and the complete primary/co-sponsor delta invariant, including Evidence/Records parity and all four returned holds. |

Search and crawl catalogues and asset stamps, including spa-shell and SEO links, were rebuilt with `build_search_catalog.mjs`, `build_crawl_catalog.mjs` and `stamp_assets.mjs`. Tracked output matches fetched main; the ignored crawl sitemap now also includes row 172's Glenn Lazarus Team; `stamp_assets.mjs --check` passes. No generated artifact was selected with a merge-side override. The changed lockfile's dependencies were APFS-cloned from a Mac worktree with exactly matching lockfile bytes.

## Validation

- Python exporter, refresh and division regressions: 203 tests passed.
- Portal `npx tsc --noEmit`: passed.
- Focused portal run through the shared slot wrapper, concurrency 4: 410 tests/file entries passed.
- Full portal run through the shared slot wrapper, concurrency 4: 4,958 tests passed, zero failures, cancelled or skipped (211.7 seconds).
- Generated stamp check and `git diff --check`: passed.

The focused portal name pattern was `the shipped index preserves|the next dated export|server: sponsor parties|audited party labels|dated sponsor|party directory and sitemap use the same canonical inventory`.
The Python command retained the prior exporter modules and added `test_export_division_pages`:

```sh
PYTHONPATH=tests python3 -m unittest \
  scripts.test_export_bills_sponsors scripts.test_export_bills_cleanup \
  scripts.test_export_drafts scripts.test_export_briefs \
  test_export_bill_divisions test_export_bills_facts \
  test_bill_lifecycle_export test_bill_refresh_briefs \
  scripts.vm.test_bills_refresh scripts.vm.test_fixture_imports \
  test_vote_parties test_export_division_pages
```

## Failed runs, verbatim messages, and fixes

The first focused Python run had 14 errors in 44 tests from the omitted mock import. The repeated message was:

```text
NameError: name 'patch' is not defined. Did you mean: 'Path'?
FAILED (errors=14)
```

Adding the import fixed that run: 44 tests passed. After adding the regression invariants, a 48-test run had one failure because the new reviewed-map test incorrectly expected s1127 to be a member of that map. The exact failure was:

```text
FAIL: test_projection_preserves_every_reviewed_decision_except_two_named_labels (test_export_bills_facts.PublishedBillFacts.test_projection_preserves_every_reviewed_decision_except_two_named_labels)
AssertionError: {'au-[49 chars]rty')} != {'au-[49 chars]rty'), 'au-federal-s1127': ('Nick Xenophon Tea[18 chars]ce')}
+ {'au-federal-s1127': ('Nick Xenophon Team', 'Centre Alliance'),
- {'au-federal-s1309': ('Nationals', 'Country Liberal Party')}
? ^

+  'au-federal-s1309': ('Nationals', 'Country Liberal Party')}
? ^
FAILED (failures=1)
```

The map invariant now checks its sole change, s1309; the separate complete projection invariant checks both s1309 and s1127. No reviewed data or expected party was changed to resolve that test.

The first focused portal run had one failing file (407 passed, one failed), from the duplicated merge import:

```text
SyntaxError: Identifier 'sponsoredBills' has already been declared
```

Removing the duplicate import fixed it; the rerun passed all 410 entries. The complete Python run then passed all 203 tests. No production, deployment, PR, simulator, Android, xcodebuild, SSH or blocked parliamentary-source request was used.

The first complete portal run passed 4,957 of 4,958 tests. Its sole failure was the pre-merge ignored crawl sitemap, which omitted Glenn Lazarus Team from row 172's merged party-member graph. The failure text was:

```text
✖ party directory and sitemap use the same canonical inventory, including the seven audit gaps (53.856834ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  ... Skipped lines

    [
      '/subject/party/animal-justice-party',
      '/subject/party/australian-conservatives',
      '/subject/party/australian-democrats',
      '/subject/party/australian-motoring-enthusiast-party',
  ...
      '/subject/party/gerard-rennick-people-first',
  -   '/subject/party/glenn-lazarus-team',
      '/subject/party/greens',
      '/subject/party/independent',
      '/subject/party/jacqui-lambie-network',
      '/subject/party/katters-australian-party',
      '/subject/party/labor',
```

The crawl builder regenerated the sitemap to 29 parties, retaining the reviewed identity. No count assertion or reviewed fact was removed. The final focused rerun, including this assertion and all sponsor patterns, passed all 410 entries. The final Python rerun with full-data Evidence/Records parity passed all 203 tests.

The final complete portal rerun passed all 4,958 tests. The merge-forward acceptance items are complete; the only remaining publication change is the next nightly export of the two reviewed naming deltas above.
