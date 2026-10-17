# Treasury Tax Expenditures and Insights Statement

This explicit annual lane follows stage → reviewed promotion → server-rendered page. It is outside nightly. No data acquisition is triggered by parsing, checks, rendering or promotion.

- `acquire.py URL CACHE_NAME`: sequential, identifying OPAXBot GETs; completion-to-next-request spacing at least 5.1 seconds; current robots policy and exact statement/rights/download allowlist. Any refusal, challenge or network error holds the ledger and prevents later requests. No alternate agent, host, proxy, archive or Firecrawl. Originals stay under `portal/private/tax-expenditures/`.
- `stage.py`: offline file hashes and website/document rights review before parsing the workbook's `Revenue forgone estimates` sheet. Appendix A.1 native Word tables supply benchmark/reliability/type metadata and independent controls. Only Treasury's published combined Tables 2.2 and 2.4 are staged as totals; copied Word cells are checked against the PDF. There is no estimate summation function. Publisher-withheld cells stay in internal source/reconciliation evidence and are removed from the public rows and cell allowlist.
- `check.py --dry-run --verify-originals`: validates exact projection, source receipts, codes, original cells and reconciliation without writes. Use `--dry-run` without the original-file flag in a checkout without the private download cache.
- `preview.mjs`: bundles the actual Worker and serves the promoted `portal/public/tax-expenditures/data.json` through ASSETS for local QA. The browser gate checks exact asset bytes and the approved review manifest. Port 9792 by default, override `OPAX_TAX_PORT`; no production bindings. `OPAX_TAX_PREVIEW_DATA=none` exercises the unpromoted 503/closed-menu state.

`data/staged/tax-expenditures/review.json` is **approved** for fixed commit `88881839f55187437bd17ff722fc9838eb99cfd9`, binding the five exact input digests. The user explicitly authorised this round’s local reviewed promotion. The asset has 2,444 public observations; four withheld source rows remain internal.

For next year, acquire only newly authorised/licence-cleared source files, stage and reconcile, review the new committed snapshot, and update the approved review receipt and digests. Then explicitly run:
```sh
python3 scripts/promote_hub_data.py tax-expenditures --dry-run --votes-reference origin/main
python3 scripts/promote_hub_data.py tax-expenditures --votes-reference origin/main
python3 scripts/promote_hub_data.py tax-expenditures --check-public --votes-reference origin/main
```

The promoter verifies the staged projection, counts, licences, receipts, exact review digests and schema-1 votes bytes, then atomically replaces only `portal/public/tax-expenditures/data.json`. Default nightly hubs are unchanged. The current reviewed asset was promoted locally under the user’s explicit instruction; nothing was pushed or deployed. The local route returns 200 and its Money link appears. If the asset is absent or has no cleared public rows, the route returns 503 and the menu gate stays closed.

Run `npm ci` in `portal` before Node tests. Targeted Python/Node tests, TypeScript, `npm run -s check`, staging dry run, Wrangler deployment dry run and `votes.json` byte equality are the delivery gates. Browser QA saves 390/1440 top/table screenshots and geometry receipts under `portal/private/tax-expenditures/`.
