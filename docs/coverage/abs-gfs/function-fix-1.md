# ABS GFS function review fix 1

20 October 2026 Melbourne. Baseline `12a8ab62ceacf608f0d92ebd529b0bc1313e6de3`; branch `coverage/abs-gfs-function`. No fetch, push, deploy, nightly or production write. Numerical staging and its pending review receipt are unchanged.

## Consolidation headings

Both headline and function cards now use one shared [mapping](../../../portal/src/government-finance-groups.ts), keyed only on the published level and jurisdiction. Original jurisdiction fields, selectors, source labels and exports are unchanged.

| Published level / jurisdiction | Heading in both sections |
| --- | --- |
| Commonwealth / Australia | Commonwealth government |
| State / Australia | Total state governments |
| Local / Australia | Total local governments |
| State and local / Australia (including Education Table_8) | Total state and local governments |
| Control n.f.d. / Australia | Control n.f.d. |
| All levels of government / Australia | Australia, all levels of government |
| National / Australia (separate debt-matrix group) | National general government |
| Individual state or territory | Original jurisdiction name |

The exhaustive heading test renders every published level/sector combination, resolves each card's original workbook-cell link back to its published level and jurisdiction, and checks its heading independently of the shared mapping. No national-group card reads plain Australia; no heading uses an em dash. The National debt group stays distinct from Commonwealth.

## Diagnostic sums remain internal

The requested reconciliation arithmetic remains intact, with a one-line comment at the sum site: it is a check and is never published. No computed sum replaces a published cell.

Three new public-output tests exercise the actual promoter in an isolated synthetic-review fixture, both CSV exports, server-rendered cards/tables/hydration, the freshly built catalogue, and authenticated local `/mcp` requests. All external network calls are forbidden in those tests; auth and rate-limit storage are local stubs.

The fixture adds identifiable internal-only metadata to each of the three additive diagnostic families: function divisions, education purposes and function groups. Validation still recomputes and compares the full diagnostic records. The promoted asset and public outputs contain none of those diagnostic fields or unique numeric probes. Three controls where rounding makes the computed sum differ from the published total prove that the original cell wins, rather than relying on numeric coincidences.

All **8,246 monetary observations** in the isolated promoted asset are traced to original workbook cells and matching SHA-256s in the explicit local test mode. Every exported CSV amount and original-million value is checked against its cell; HTML cards, table amounts and hydration use those same published values. GFS does not currently publish observation records into the search catalogue or MCP; the tests inspect every generated catalogue record, verify empty diagnostic-probe searches, and prove the MCP reader cannot open a reconciliation record.

Ordinary CI tests check the committed source-cell contract without requiring the untracked XLSX cache. The local release gate uses `OPAX_GFS_VERIFY_ORIGINALS=1` to independently verify the retained workbook bytes as well. This run used that mode.

## Verification

- **21 targeted web tests pass:** 11 headline, seven function (including exhaustive headings), three public-output tests. The three public-output tests also pass in portable contract mode.
- **20 Python GFS tests pass**; **14 existing promoter regression tests pass**.
- `npx tsc --noEmit -p .`, `npm run -s check`, original-cell dry run, Worker dry run and `git diff --check` pass.
- Both 390/1440 local Worker screenshots retaken and visually inspected: [390 functions](../../../portal/private/abs-gfs-function/government-finance-390-functions.png), [1440 functions](../../../portal/private/abs-gfs-function/government-finance-1440-functions.png). The desktop top capture was refreshed too because its first headline changed. [Browser evidence](../../../portal/private/abs-gfs-function/browser-results.json) checks identical headings in both sections. Each table still fits its 350px phone container, also without JavaScript; no page overflow or browser errors.
- The generated catalogue manifest is restored. `votes.json` remains schema 1 and byte-identical to baseline: SHA-256 `9b7fc46c65185223d70a49b1bd8ee807327473330b02392963aa320b191b7a93`.
- All staged numerical inputs, source receipts, the pending review receipt and real public GFS asset remain byte-identical. The real promoter continues to refuse pending approval; synthetic review fixtures never approve or promote the real snapshot.

[Fix validation](../../../portal/private/abs-gfs-function/fix1-validation.json) records current screenshot hashes and gates. The initial implementation's `validation.json` records the earlier commit; this fix's screenshots supersede those earlier screenshot hashes.
