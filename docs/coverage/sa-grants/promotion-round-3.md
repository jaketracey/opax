# SA historical grants: reviewed promotion, round 3

**Status: LIVE pending deploy.** Independent re-review r2 approved
`32af360d74c26d435977a1451f18fa897cd8c861`. The six staged inputs are byte-identical
to that commit. The [review receipt](../../../data/staged/sa-grants/review.json)
records the APPROVE verdict, evidence hash, approved commit and exact inputs.
[Machine-readable validation](promotion-round-3.json) records this promotion.

## Merge and public-file scope

Ran `git merge --no-edit origin/main` without fetching. The current local
`origin/main` is `9c7deab0d0165805d687a90fbec4599a19842d04`; it is already an ancestor
of this branch, so Git reported **Already up to date**. No merge conflict or HTML
replacement was needed. `npm run -s stamp` in `portal/` reported all stamps
current. All top-level HTML files and `spa-shell.js` (13 files in total)
have no difference from main after normalising only `?v=` values.

The real promotion was:

```sh
python3 scripts/promote_hub_data.py sa-grants --votes-reference origin/main
```

Only the promoter's declared output was added:

| Promoted file | Bytes | SHA-256 |
| --- | ---: | --- |
| `portal/public/sa-grants/data.json` | 1,271,823 | `8a6311c10c14ecad7cd11797af203f0c03e17094af28aa68b5095abac6941b48` |

A hash comparison of every file under `portal/public/` before promotion and after
all gates confirms this is the **only added or changed public file**. There were
19,683 files before and 19,684 afterward. There is no stamp-only content drift.
The gate runs left no tracked regenerated build-file changes, so none needed
restoration. Worker dry-run output is private and is not part of promotion.

## Contents and containment

The asset contains **677 Grants SA awards**, with 318 for 2016–17 and 359 for
2017–18, two source documents and the reviewed original-row manifests. All 677
rows re-parse from the retained originals. Neither CSV publishes a total; no
amount total is calculated or exported. Source, dataset/resource, year,
snapshot, licence and attribution remain attached to the source records.

**No PCIF workbook/file body, PCIF award row or PCIF source-row manifest is
promoted. No applicant or unsuccessful records or resource metadata are
promoted.** The approved shape retains only five non-numerical explanatory
source hold notes for the unavailable PCIF originals. Those notes have no
amount, recipient, project description, rows, source-cell manifest or download
URL. The original XLS files remain held after their single 404 receipts.

The existing parser/exclusion and output guards pass. Three further checks
apply the same boundaries directly to the promoted file: manifest/source-row
identity and held-file exclusion; adversarial computed/altered/held additions
across HTML, hydration and CSV; and search-catalogue/MCP containment. No person
entities, recipient facets, identity joins, inferred links or computed amount
totals are introduced. The MCP check uses synthetic local stubs only.

## Local Worker and browser proof

The preview used the actual Worker and **`OPAX_SA_GRANTS_PREVIEW_DATA=public`**.
The browser fetched `/sa-grants/data.json` locally and required its response
bytes to match the promoted file and its approval/input manifest to match the
review receipt. No staged candidate substitution or production binding was used.

| Viewport | Register status | Asset status | Page width | Each table / container | Recipient, Year, Amount |
| ---: | ---: | ---: | ---: | --- | --- |
| 390 | 200 | 200 | 390 | 350 / 350 px | All visible; Amount ends at x=370 |
| 1440 | 200 | 200 | 1440 | 1324.8125 / 1325 px | All visible, with the other source columns |

Both source tables fit at each width. Years have `white-space: nowrap`.
Whole-dollar display survives sorting and hydration. Server HTML carries all
677 source rows; the shared table consumes its initial payload on enhancement.
The no-JavaScript phone render also returns 200 with Year and Amount visible.
**No page errors or 503 responses** occurred. Only loopback fixture/browser
traffic was allowed; external networking and all Worker outbound services were
blocked. No source request, production Ask, generation, voice or auth was driven.

Private evidence on this Mac:

- [390 table](../../../portal/private/sa-grants/round3/390-table.png)
- [390 section](../../../portal/private/sa-grants/round3/390-section.png)
- [1440 table](../../../portal/private/sa-grants/round3/1440-table.png)
- [1440 section](../../../portal/private/sa-grants/round3/1440-section.png)
- `portal/private/sa-grants/round3/browser.json`, `browser.py`,
  `containment.test.mjs`, `containment.log`, `targeted-tests.log`, `check.log`,
  `tsc.log`, `worker-dry-run.log`, `promote.log`, `promotion-scope.json`.

## Gates

All executed checks passed:

- **53 Node checks**, including the existing SA grants numerical/held/privacy,
  plain-language, CSV, search/MCP guards, federal grant modules and SA budget.
- **12 SA grants Python** parser, exclusions, receipt/stop/lock and promoter
  checks; **14 SA budget Python** regression checks.
- **Three containment checks against the actual promoted output**.
- `tsc --noEmit` and `npm run -s check`.
- `wrangler deploy --dry-run --outdir private/sa-grants/round3-worker-dry-run`;
  compile only, no deployment or API write.
- Staging `check --dry-run`, promoter `--dry-run`, and promoter `--check-public`,
  using the current local `origin/main` as the votes reference.
- Public-file scope, HTML/shell stamp comparison, exact approved input hashes,
  protected coverage wording and `git diff --check`.

That is **82 passing checks**, plus the browser and CLI gates. The unchanged
`D1 grants keeps source rows` fixture was excluded because it writes a local D1
fixture, and this round authorises no D1 writes. No KB/D1 write was performed.

`votes.json` remains schema 1, **byte-identical to current `origin/main`**,
1,309,476 bytes, SHA-256
`d89f34bd8acb440da2efe8364d147e51d0cb8737d5631bac091cd524fe9bf999`.
The shared Next guard paragraph and 19 October decision are byte-identical to
both main and the approved commit. Nightly/default promotion hubs are unchanged.

## Future explicit re-promotion

After reviewing any changed source inputs and recording independent approval of
the exact new hashes, run explicitly from the reviewed checkout:

```sh
python3 scripts/promote_hub_data.py sa-grants --votes-reference origin/main
python3 scripts/promote_hub_data.py sa-grants --check-public --votes-reference origin/main
```

The current unchanged receipt can reproduce the current asset. Changed inputs
must fail until separately reviewed; a fresh source acquisition is a separate
operation and is not part of promotion. This historical series stays outside
nightly. No push, deployment, nightly run, native build or production write
occurred in round 3. The orchestrator changes coverage to LIVE after deployment.
