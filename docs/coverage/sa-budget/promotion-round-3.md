# SA historical budget: reviewed local promotion

**LIVE pending deploy**, 21 October 2026 Melbourne. The independent r2 verdict
is **APPROVE** for `afb8837ee9e6553aea25428ff93c569edc7de9e8`. The public
asset has passed the explicit reviewed promoter and the local Worker checks.
Deployment remains with the orchestrator, which will change coverage to LIVE
after deployment. No push, deployment, nightly, KB or D1 write occurred.

## Main, review and unchanged inputs

`git merge --no-edit origin/main` returned **Already up to date**. The local
`origin/main` was `d20bf14e0f5e333a7b01e950a0f0451c94165e28` and is an ancestor
of this branch. No fetch or other external request was made; this is the local
reference, not a claim that the remote was checked.

The [independent review receipt](../../../data/staged/sa-budget/review.json)
records the approved commit, r2 verdict and evidence digest. The main-checkout
evidence is `.ops/codex-runs/review-coverage-sa-budget-r2.last.md`, SHA-256
`1c8883ef61bc39915d3dc49a2877872885f5161073a3d1c9e4bbdb1ea71fda9f`.
All six staged inputs are byte-identical to the approved commit and match the
receipt hashes:

| Input under `data/staged/sa-budget/` | SHA-256 |
| --- | --- |
| `inventory.json` | `dad0f7b79707dcfab1c8f430ea902835c0c366fcc7630bbf36c03a56c8a31fac` |
| `receipts.json` | `18a00b722934461c33b8cd252af8670a3db6e26cbf13399ab34044be644e2c46` |
| `series.jsonl` | `c62d9890087a88ad5cad4986bfaa4d5f95b00563c1380e5fd1e4a3c6e98fe07f` |
| `reconciliation.json` | `424215a541becd441c10a1f10187b318f3f65c14b083790b1f8010c7c04e543d` |
| `acquisition-audit.json` | `0744f2a40d333a544035c0a07c1020cb3d48335c8401a73a39d6e6cf7128869b` |
| `hub.json` | `633c8cbee565cd7a33eba6b1ac2280779be32cca1e7d88140986eb1a7a82be7b` |

The original source/licence findings, verbatim warnings and disclosed acquisition
overlap remain in the [source report](report.md). This round made zero source
requests. Four budget workbooks contribute 447 cells; all 120 budget
reconciliations pass. The 4,774 function cells remain held for unresolved scale
and five reconciliation exceptions. Only their explanatory metadata is public.

## Promoted output

The real command completed successfully:

```sh
python3 scripts/promote_hub_data.py sa-budget --votes-reference d20bf14e0f5e333a7b01e950a0f0451c94165e28
```

| Declared output | Bytes | SHA-256 |
| --- | ---: | --- |
| [`portal/public/sa-budget/data.json`](../../../portal/public/sa-budget/data.json) | 1,004,708 | `629b7ad0f531ff39fc141f4bb04d64eb276736fc47324295fa72830fd18f746d` |

A before/after hash manifest of every public file found exactly this one
addition. No other public file changed. `npm run -s stamp` succeeded with stamps
already current. All 12 tracked public HTML files and `spa-shell.js` equal
`origin/main` after normalising `?v=` values. The checks left no tracked generated
build-file changes to restore.

## Validation

| Gate | Result |
| --- | --- |
| Python SA parser, reconciliation, licence, review and containment tests | 14 passed |
| Portal SA, budget, plain-language and identity-cache targeted tests | 26 passed |
| Promoted public-output/Worker tests | 3 passed |
| `tsc --noEmit` | Passed |
| `npm run -s check` | Passed |
| Local Wrangler deployment dry run | Passed; no deployment |
| SA staged dry run | Passed; 447 cleared cells, 4,774 held cells, zero writes |
| Promoter dry run and `--check-public` | Passed against the same votes reference |
| `votes.json` | Byte-identical to `origin/main`; SHA-256 `d89f34bd8acb440da2efe8364d147e51d0cb8737d5631bac091cd524fe9bf999` |
| Coverage shared guard paragraph and 19 Oct private-names line | Byte-identical to `origin/main` and the approved commit |

Containment tests read the promoted file and compare its full public projection
with the validated staged projection. All 447 rows pass the serving guards.
There are no function documents, numeric rows or source-cell manifests, and no
internal reconciliation sums. The existing mutation tests reject invented
totals, held cells, changed source values and unapproved rights from HTML,
hydration and CSV. Search catalogue and MCP checks confirm no SA numeric
source or held cells are exposed there. `sa-budget` stays outside default/nightly
promotion.

The browser used the actual local Worker on loopback port 8974 with the promoted
disk asset; candidate substitution was disabled. Both the route and fetched
asset returned 200. The fetched bytes equal the promoted file's size and hash.

| Browser check at `/budget#sa-budget` | 390 px | 1440 px |
| --- | --- | --- |
| HTTP status | 200 | 200 |
| Document scroll width | 390 | 1440 |
| SA tables fit | All four; 350 px each | All four; 1,325 px available |
| Visible columns | Measure, Fiscal year, Value | Full seven-column desktop set |
| Value inside viewport | Yes, right edge 370 px | Amount/percent columns shown |
| Fiscal years | No wrapping | No wrapping |
| Server-rendered source rows | 447 | 447 |
| Browser errors / 503 responses | None | None |

The first caption fits without horizontal scrolling. Estimate/actual text
survives paging beneath the measure at 390; the percentage filter displays the
published `-2.4%`. There were zero external browser requests. Network guards
and the local Worker's outbound refusal prevent external access.

Private evidence paths:

- `portal/private/sa-budget/r3-browser-results.json`
- `portal/private/sa-budget/r3-sa-section-390.png`
- `portal/private/sa-budget/r3-sa-section-1440.png`
- `portal/private/sa-budget/r3-sa-table13-390.png` (390 × 900)
- `portal/private/sa-budget/r3-{python-tests,portal-tests,public-output-tests,tsc,check,worker-dry-run}.log`
- `portal/private/sa-budget/r3-{promotion,promotion-dry-run,check-public}.jsonl`
- `portal/private/sa-budget/r3-{staged-dry-run,html-audit,output-audit}.json`

The [machine-readable validation](promotion-round-3.json) records the gate
results, browser measurements and evidence hashes.

## Future explicit re-promotion

After confirming the local main reference and approval of the exact inputs:

```sh
python3 scripts/promote_hub_data.py sa-budget --dry-run --votes-reference origin/main
python3 scripts/promote_hub_data.py sa-budget --votes-reference origin/main
python3 scripts/promote_hub_data.py sa-budget --check-public --votes-reference origin/main
```

Changed inputs require a fresh independent review receipt. Promotion is an
explicit annual action and writes only the declared SA asset. Nightly stays off;
the function hold requires a separate resolution and review.
