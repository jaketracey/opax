# ACT invoices round 3 — approved local promotion and bundle

Status: **LIVE pending deploy**. The orchestrator changes this to LIVE only after
upload, deployment and production verification. This lane made **zero external
network requests**, release creations, uploads, pushes, deployments, nightly runs
or remote D1 writes.

## Merge, review and promotion

- `git merge --no-edit origin/main` reported **Already up to date**. The existing
  local `origin/main` is `6b021dc84`; no fetch was made.
- Read the independent r2 review in full: **APPROVE**, no remaining findings,
  against `761926c158d5ecb15b2b70b593ab7149eb659634`.
- Recorded that verdict, review-document hash and approved commit in
  `data/staged/act-invoices/review.json`. All **seven staged input digests** match
  the independently reviewed input set; no source value or acquisition receipt
  changed.
- Ran the shared promoter with `act-invoices --dry-run --votes-reference origin/main`,
  then without `--dry-run`. A before/after hash inventory of staging, promoted
  outputs and public assets proves that the real promotion changed only its
  declared `data/promoted/act-invoices/table.json` output: **107,519,435 bytes**
  (the original series inside remains **98,252,512 bytes**). The other **21,447
  files** were unchanged. The artifact is ignored and untracked.

## Approved bundle and public source note

The public mirror retains **127,437 records**, all eight published fields and six
source-row provenance fields. **1,784,118 field comparisons** match the staged
source. The README carries the source, dataset `kzmf-7uhp`, UTC snapshot,
**CC BY 4.0**, attribution **ACT Government** and the verbatim-record mirror
purpose. There is no supplier index, profile, join or derived record field.

- Tag: `act-invoices-2026-10-22-9461967d519f-761926c158d5`
- Asset: `act-invoices-kzmf-7uhp-2026-10-22-761926c158d5.json.gz`
- Size: **8,204,956 bytes** (7.825 MiB)
- SHA-256: `e92aba9d9ceaa2de39d6bc5ef8691eb621835fee38c93e58a34c687b8ecfae46`
- Manifest: `data/promoted/act-invoices/release.json`, approved r2 review reference.
- Local gzip and README: `portal/private/act-invoices/release/`, ignored/untracked.

The page’s **Attribution and source receipt** and CSV notes now say OPAX keeps a
verbatim public copy of the published file for its table load, link to that
release and carry its gzip SHA-256. The disclosure comes from the committed
manifest and is attached only to the matching approved snapshot/review. The
release link is prepared; the release has **not** been created or uploaded.

## Checks

- **73 targeted Node checks pass**, including the two new source-note checks,
  donor privacy, CSV continuation, renderer, container width, release failures,
  retained rows and table/reload contracts.
- **Full portal suite: 2,554 pass, zero failures or skips.** Built search and crawl
  prerequisites offline first, then restored the generated search manifest.
- **8 ACT Python checks + 14 shared promoter checks pass**, including acquisition
  holds, approved/changed-input gates and output containment.
- TypeScript and `npm run check` pass.
- Worker `deploy --dry-run` passes with metrics and Node external network
  disabled. Staging/promoter dry runs pass. The actual workflow-file dry run
  proposes the exact approved download when reload is on and skips when off;
  neither mode downloads anything.
- All **13 HTML/spa-shell files** were checked against local `origin/main`: only
  stamps and previously approved branch changes differ. The final round 3 adds
  no non-stamp HTML/spa-shell changes. Asset stamps pass.
- `votes.json`, `pay.json`, the shared COVERAGE guard and the 19 October decision
  are byte-identical to the reviewed parent; votes/pay also match `origin/main`.
- Local browser uses the **real promoted artifact** in isolated D1, with all
  outbound Worker/browser requests denied. **390 and 1440 return 200**, no 503,
  no page overflow or browser errors. Supplier, Date and Amount fit at 390;
  dates remain unbroken, Amount ends at x=370, and sorting/no-JavaScript/identity
  URL checks pass. The public-copy note is visible in the expanded receipt.
- Actual promoted-data CSV returns 200 and carries the manifest link/hash exactly
  once. Screenshots: `390-table-crop.png`, `390-section.png`, `1440-section.png`
  in `portal/private/act-invoices/`. Logs remain there. The local preview is
  stopped and its SQL/runtime and Worker dry-run scratch are removed.

[Machine-readable validation](round3-validation.json).

## Orchestrator handoff — commands not run here

The independent review receipt continues to name **761926c15**. The release tag
also carries that review prefix. **The release target is the final round 3
handoff commit reported with this report**, so it includes the manifest and
public-copy note. After that commit exists on GitHub, run from the repository
root, replacing `FINAL_ROUND_3_SHA` with that exact reported commit:

```sh
gh release create act-invoices-2026-10-22-9461967d519f-761926c158d5 \
  --repo jaketracey/opax --target FINAL_ROUND_3_SHA \
  --title "ACT invoice source mirror" \
  --notes-file portal/private/act-invoices/release/README.md
node scripts/act_invoices/publish_bundle.mjs --upload
```

The upload command revalidates/rebuilds from the approved local artifact; verify
its printed size/hash against the committed manifest above. It does not create
or overwrite a release asset. Keep the approved local artifact and README/gzip
available to that orchestrator; no promoted records or gzip are committed.

Then integrate the handoff into main, enable `OPAX_TABLE_RELOAD=on` and use the
existing Deploy workflow. Verify the release preparation is `ready`, SQL reload
and smoke checks pass, and the production page/API match the approved snapshot
and count. Only then change coverage from **LIVE pending deploy** to **LIVE**.
