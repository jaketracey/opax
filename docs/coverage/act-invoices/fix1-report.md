# ACT invoices fix 1 — review findings addressed

Reviewed parent: `766828d2e`. Read the full CHANGES review in
`/Users/jake/Projects/opax-ios/.ops/codex-runs/review-coverage-act-invoices.last.md`.
Same Mac worktree and branch. **No ACT portal request, push, deployment or release
upload.** The original records and review-input hashes are unchanged; independent
approval and promotion remain pending.

## Findings and tests

| Finding | Change | Evidence |
| --- | --- | --- |
| P1 delivery | Public `jaketracey/opax` release mirror, small pinned manifest, explicit upload helper and guarded Actions preparation before SQL build/reload. Compressed/raw sizes and SHA-256s, approved review receipt and source schema must match. Failure excludes ACT, retains its D1 rows/receipt and marks the Actions step/summary. | Five `P1:` tests in `portal/test/act-invoices-release.test.mjs`: approved package shape; good transfer; bad hash/size/missing asset/review mismatch and retained D1 rows; pending/derived-field rejection and upload opt-in; actual workflow YAML ordering and reload-off skip. |
| P2 caveats | Page and every ACT CSV page include the invoice-value threshold, received-date caveats, no unique invoice ID, **1,530 duplicate groups / 2,393 extra copies**, observed **135 months**, two pre-start dates/two missing dates, and the warning that month presence does not establish complete entity reporting. The shared CSV continuation reader validates and carries the notes once into the downloaded CSV. | `P2: page and CSV include…` and `P2: browser CSV continuation…` in `act-invoices-fix1.test.mjs`; real API/CSV and existing shared CSV contracts pass. |
| P2 entities | Reporting-entity cells show raw codes beside the publisher's definitions. The publisher's key is beside the table and filters. `CED-TCO → TCCS-TCO` resolves through the retained definition; unknown codes remain unchanged. Filter/CSV values retain raw codes. | `P2: publisher definitions and aliases…` checks ACTAO, SLA, CED-TCO, unknown codes, facets and CSV. The existing supplier privacy suite still passes. |
| P3 heading/date | One visible “Published invoice records” caption, **July 2015 to September 2026**, and **22 Oct 2026 (Melbourne)**. Original UTC timestamp remains in provenance. Time-zone conversion feeds OPAX's shared `shortDate` helper. | `P3: one table heading…`, site-wide `format.test.mjs`, SSR, no-JavaScript phone and browser checks. |
| P3 amounts | Display removes `.00` from whole dollars, including after table repaint; nonzero cents remain. Numeric values and original amount strings in CSV stay unchanged. | `P3: whole dollars omit .00…` compares SSR, repaint, unchanged fixture values and actual CSV record lines; 390/1440 browser sorting checks. |

[Machine-readable validation](fix1-validation.json).

## Bundle dry run

The public wire format is gzip JSON with an embedded short `README`, source,
dataset ID, snapshot, CC BY 4.0 attribution **ACT Government**, the eight published
fields and six source-row provenance fields. Record values and nulls are copied
verbatim. No supplier index, join, profile or derived date/amount/period field is
included. The verified table loader derives display fields after downloading.
The README is also written as a local file for the GitHub release notes.

The candidate package is smaller than the review's 10.4 MiB internal-artifact
estimate because those derived table fields are omitted.

| Item | Dry-run result |
| --- | --- |
| Repository | **jaketracey/opax — public**, including release assets |
| Manifest | `data/promoted/act-invoices/release.json` |
| Tag | `act-invoices-2026-10-22-9461967d519f-pending` |
| Asset | `act-invoices-kzmf-7uhp-2026-10-22-pending.json.gz` |
| Compressed size | **8,204,935 bytes** (7.825 MiB) |
| Decompressed size | **79,921,365 bytes** |
| Records | **127,437**, all source values unchanged |
| Review | **pending; no upload** |

Compressed SHA-256:

```text
40b78a2e9cdae7c68b5d0ee2718afd3bc42b4b001f5f64814ff7f705cd156118
```

Offline inspection compared **1,784,118 source-field/provenance values** against
the retained series, with no difference. The committed manifest is explicitly
pending and CI rejects it for production. Approval changes review metadata and
therefore the final bundle/hash; the orchestrator must rebuild and commit that
approved manifest rather than upload this candidate.

## Delivery and exact orchestrator sequence

The complete commands and their order are in
[the runbook](../../../scripts/act_invoices/README.md#fix-1-reviewed-public-release-delivery):

1. Independently approve the corrected code commit and unchanged input digests;
   put that approval in `data/staged/act-invoices/review.json`. Ensure the reviewed
   commit exists on GitHub so the release tag can target it.
2. Run the shared promoter with `act-invoices --dry-run --votes-reference 6b021dc84`,
   then the same command without `--dry-run` to create the approved local artifact.
3. Run `node scripts/act_invoices/publish_bundle.mjs` to build and inspect the
   approved gzip, README and pinned manifest. Default operation is local only.
4. Create the manifest's public release tag targeting the reviewed commit, with
   `README.md` as its release notes, then run
   `node scripts/act_invoices/publish_bundle.mjs --upload`. Only this explicit
   flag invokes `gh release upload`; assets are not overwritten.
5. Commit the approved manifest/receipt, integrate the reviewed code into `main`,
   set `OPAX_TABLE_RELOAD=on`, then run the existing Deploy workflow on `main`.
6. Verify `act_invoice_asset: ready`, the SQL preflight/load/smoke, and the
   production page/API against the approved snapshot/count. No production
   verification or external step was performed by this fix lane.

Actions uses `gh release download` for the exact tag/asset in the manifest and
its normal GitHub token. The step is skipped when reload is off. An unavailable,
unapproved or invalid file produces a visible warning, held output and run
summary. The SQL build consumes the output status: even a stale local file is
ignored on a held path. Existing approved ACT D1 rows and their receipt remain;
other tables can reload. There is no ACT portal fetch or nightly acquisition.

The new download/upload syntax was checked against the official
[GitHub CLI download](https://cli.github.com/manual/gh_release_download) and
[upload](https://cli.github.com/manual/gh_release_upload) manuals. Context7 was
unavailable in this session.

## Gates and screenshots

- **124 targeted Node checks pass.**
- **Full portal suite: 2,552/2,552 pass, zero failures or skips.** The local search
  and crawl prerequisites were rebuilt offline, matching the CI order. Their
  generated search manifest was restored to the parent before committing to
  exclude an unrelated catalogue refresh. The commands are recorded in validation.
- **8 ACT Python checks pass**, including held acquisition and promotion gates.
- `tsc --noEmit` and `npm run check` pass.
- Staging dry run passes for all 127,437 rows. The promoter dry run intentionally
  stops at pending review, with zero writes.
- The workflow-file dry run validates the actual guarded step and its order.
  Reload `on` holds the pending manifest; reload `off` reports skipped. Neither
  mode downloads anything.
- `votes.json`, `pay.json`, all reviewed source inputs, the shared COVERAGE guard
  paragraph and the 19 October decision are byte-identical to the reviewed parent.
- New `390-table-crop.png`, `390-section.png`, `1440-section.png`, metrics and
  logs are in `portal/private/act-invoices/`. Supplier, Date and Amount fit at 390;
  dates remain unbroken and Amount ends at x=370. No browser errors or overflow.

The local preview is stopped and its reproducible SQL/runtime scratch removed.
The pending dry-run gzip/README, original source records, screenshots and logs
remain available locally for review. No ACT portal requests, uploads, pushes,
deployments or production data writes occurred.
