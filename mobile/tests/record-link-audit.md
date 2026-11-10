# tf-ADdjoG2Y record navigation audit

The donor was being overwritten by the next party money record. Its route key and mounted scroll view survived, so the new record inherited the donor's scroll position and its previous screen was still Liberal.

## Confirmed cause

- `src/features/money/MoneyRecord.tsx:593` defines `pushRecord`, but it only builds an href. The donor's party row passes that href at line 854 through `PartyMoneyRow` and `LinkRow` to `RowLink`.
- `src/features/money/records.ts:86` (`moneyFocusRoute`) calls `moneyRecordRoute`. `src/navigation/routes/public-money.ts:11` always returns `/money-record`; the node lives in search params.
- Before this fix, the iOS `<Link>` at `src/design/row-link.tsx:272` omitted `push`. The non-iOS and accessibility paths already called `router.push`. There were no `getId`, `dangerouslySingular` or application de-duplication options on these screens.
- Installed `expo-router` 57.0.24, `build/layouts/StackClient.js:93-104,162-180`, matches a default NAVIGATE to the current route name, then compares `getSingularId`. `build/useScreens.js:383-399` builds that identity from path segments only. Both money-record destinations therefore match and retain the same key with new params.
- The test `default navigate reproduces the query-only record reuse that a forward Link must avoid` confirms that behaviour with the installed router: the route count and key stay the same when the node changes.
- A separate Back-label omission existed at `src/navigation/stack/screen.tsx:43`: money-record was not a loaded-title route. It now uses the donor's name at lines 91-95, while keeping the existing Money record fallback when unnamed.

Expo documents explicit forward pushes in its [navigation guide](https://docs.expo.dev/router/basics/navigation/). Its [Stack API](https://docs.expo.dev/versions/v57.0.0/sdk/router/stack/) also explains that dangerouslySingular reuses existing screens. No singular option was added here, because moving an earlier visit would break one-step Back.

## Shared change

`src/navigation/record-link.ts` recognises record destinations and compares semantic identity only with the focused screen. Different records push even when the same record appears earlier in history. A tap on the record already on top does nothing. Names and entry hints such as via do not change identity. Grant-program seat/national views and grants-list filters remain distinct destinations. The legacy money-node alias shares money-record identity.

`RowLink` sets push for those destinations. Touch, VoiceOver and keyboard activation use the same guard. The current record has no redundant preview, because native preview commits navigate independently of the tap callback. Other previews, menus and zoom props remain in place. Other callers retain their previous Link navigation mode. LinkRow and BillRow keyboard activation use the same guard.

The three existing imperative bill/reader/pane navigation adapters also use the shared push helper. Their iPad pane branches remain intact. No scroll-reset effect was added: each new route gets a fresh mounted screen, and Back retains the previous route key and scroll view.

## Route audit

“Chains to itself” means a direct onward link in the current UI, including a different view on the same route. “Reused before” means an affected existing forward link, rather than a hypothetical link on a screen without a self link. Every row has an additional same-kind route-fixture test, even when the current UI has no direct self link. Those tests use the real Expo router and stack; Jest drives the action selected by the rendered Link because native preview hosts do not render in Jest.

For the Test name column, `T(route)` is the exact parameterised Jest name: **`route pushes a new record, preserves Back history and ignores the same record on top`**, in `tests/record-link-navigation.test.tsx:159`.

| Route | Chains to itself? | Reused a screen before the fix? | Fixed how | Test name |
| --- | --- | --- | --- | --- |
| `/money-record` | yes | yes | Shared push and current-record guard | `T(money-record)` |
| `/money-item` | yes | yes | Shared push and current-record guard | `T(money-item)` |
| `/money-node` | no | no | Shared push; identity aliases money-record | `T(money-node)` |
| `/grant-program` | yes | yes | Shared push; include seat/state in view identity | `T(grant-program)` |
| `/source` | no | no | Shared guard; existing presenter already pushes | `T(source)` |
| `/record-list` | no | no | Shared push and current-record guard | `T(record-list)` |
| `/electorate-date` | no | no | Shared push and current-record guard | `T(electorate-date)` |
| `/election` | no | no | Shared push and current-record guard | `T(election)` |
| `/seat` | no | no | Shared push and current-record guard | `T(seat)` |
| `/rule` | no | no | Shared guard; existing presenter already pushes | `T(rule)` |
| `/talk/record` | no | no | Shared push and current-record guard | `T(talk/record)` |
| `/members` | no | no | Shared push and current-record guard | `T(members)` |
| `/grants` | yes | yes | Shared push; list filters identify the destination | `T(grants)` |
| `/licences` | no | no | Same-identity guard | `T(licences)` |
| `/person/[slug]` | no | no | Shared push and guard; imperative reader helper uses it | `T(person/[slug])` |
| `/bill/[key]` | yes | no | Shared push and guard; bill helper uses it | `T(bill/[key])` |
| `/party/[slug]` | no | no | Shared push and current-record guard | `T(party/[slug])` |
| `/electorate/[id]` | yes | no | Shared push and current-record guard | `T(electorate/[id])` |
| `/topic/[slug]` | no | no | Shared push and current-record guard | `T(topic/[slug])` |
| `/doc/[slug]` | yes | no | Shared push and guard; reader helper uses it | `T(doc/[slug])` |
| `/bill-text/[key]` | no | no | Shared push and guard; reader/bill helpers use it | `T(bill-text/[key])` |
| `/account/sources/dataset/[id]` | no | no | Shared push and current-record guard | `T(account/sources/dataset/[id])` |
| `/licence/[id]` | no | no | Shared push and current-record guard | `T(licence/[id])` |
| `/licence/sources/[...path]` | yes | no | Shared push and current-record guard | `T(licence/sources/[...path])` |
| `/agency` | no | no | Shared push and current-record guard | `T(agency)` |
| `/connection` | no | no | Shared push and current-record guard | `T(connection)` |
| `/lead/[id]` | no | no | Shared push and current-record guard | `T(lead/[id])` |

Evidence for the existing onward paths:

- `/money-record`: Donor Parties and party donor rows: MoneyRecord.tsx:593,854.
- `/money-item`: MoneyItem children open another item on the same static route.
- `/money-node`: Legacy redirect only; redirect history has a dedicated test.
- `/grant-program`: Program.tsx:477 opens the national program from its seat view.
- `/source`: SourceSheet opens licence/originals; presentSheet uses router.push.
- `/record-list`: RecordList links out to documents.
- `/electorate-date`: Calendar updates the parent and goes Back.
- `/election`: Candidate rows open people.
- `/seat`: Chooser has its own stack; state selection remains inside it.
- `/rule`: SourceLine opens source, rather than another rule.
- `/talk/record`: Talk pushes this wrapper; embedded readers link to native record routes.
- `/members`: Member rows open people.
- `/grants`: Grants.tsx:334 opens a seat list from the seats view.
- `/licences`: A single hub; onward navigation is into licence sources.
- `/person/[slug]`: Profiles link to party/electorate/bill/doc; self chaining is tested in the route fixture.
- `/bill/[key]`: Related bills already used router.push; repeated current bill is now guarded.
- `/party/[slug]`: Party to donor to party is covered; the affected party money screen is money-record.
- `/electorate/[id]`: Electorate.tsx:585,599 links related seats; changed path ids already mounted separately.
- `/topic/[slug]`: Topic sections update local view state and link out to records.
- `/doc/[slug]`: DocumentReader.tsx:925 links similar documents; changed slugs already mounted separately.
- `/bill-text/[key]`: Text links to its bill; version changes retain their existing in-screen behaviour.
- `/account/sources/dataset/[id]`: Dataset links to the sources hub; ids are path segments.
- `/licence/[id]`: Dataset root links to the licence sources hub.
- `/licence/sources/[...path]`: Sources lists and dataset pages share this catch-all route; changed path segments already mounted separately.
- `/agency`: Actually static with id in params; links to leads, suppliers and items.
- `/connection`: Actually static with id in params; links to organisations, programs and seats.
- `/lead/[id]`: Links to subjects, money items and the map.

## Regression coverage

- `the party row on a donor pushes and Back from the party returns to the donor`: renders the real MoneyRecord with a synthetic organisation graph. It asserts the party row's push flag, a new key, the retained donor entry, the donor Back label, via: map, and the original donor scroll view after Back.
- `a newly pushed record mounts at scroll offset 0 and Back keeps the previous scroll position`: sends a scroll event at 780, opens the next record, checks its freshly mounted scroll view and zero scroll-observer state, then checks the retained previous view and offset after Back. This tests mount/state isolation, not native UIKit pixels.
- The route matrix checks same-kind pushes, repeated top taps, preview suppression, returning to an earlier identity as a fresh push, and one-step Back.
- `dynamic record kinds chain to each other and Back returns one step at a time` covers cross-kind navigation.
- `party, donor, recipient and supplier links push each step` covers the money chain variants.
- `non-record links retain their default navigation and split selections retain their callback` covers non-record callers and the selection override used on iPad.
- The three imperative adapter cases verify top-record suppression and fresh pushes of earlier records.
- `legacy money-node redirects preserve the source record and share its same-record guard` covers the actual redirect.

## Validation

The exact final gate chain `cd mobile && npm run typecheck && npm run lint && npx jest` passed.

- Typecheck: passed.
- Lint: passed, with two existing require-import warnings in donor-privacy.test.tsx and money-filter-navigation.test.tsx.
- Full Jest: 275 suites passed, one suite skipped; 6,891 tests passed and four skipped (6,895 total).
- The new navigation file contains 38 passing tests.
- `git diff --check`: passed.

No simulator or device run was performed. Native UIKit scroll pixels were not tested; the Jest checks establish fresh route keys, mounted screen isolation and retained Back state.
