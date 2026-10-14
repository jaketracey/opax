# Queensland historical ministerial diaries — acquisition held

Checked 15 October 2026 Melbourne (14 October UTC), on `coverage/qld-diaries` from `f145687392f11e7ef4bf223e4add85c6456ac5fa`. This is a stopped acquisition receipt and local implementation, not a completed historical backfill.

The [receipt ledger](../../../data/staged/qld-diaries/receipts.json) records exactly two sequential source requests with the shared `OPAXBot/1.0 (+https://opax.com.au/about; corrections@opax.com.au)` identity, no proxies and no followed redirects:

| Request | UTC requested / received | Result | Response SHA-256 |
| --- | --- | --- | --- |
| `https://cabinet.qld.gov.au/robots.txt` | 14 Oct 21:19:13 / 21:19:14 | 200; `User-agent: *`, no disallow directives | `88750636fdc6b9cbce69a97c2f473fb8df80cfe4c410f07939c10dfa431d54aa` |
| `https://cabinet.qld.gov.au/ministers-portfolios.aspx` | 14 Oct 21:20:06 / 21:20:07 | 200 with an Incapsula `/_Incapsula_Resource` script, classified as challenge markup by the existing source guard | `4c530b179b93f0848ec05213e78d3ecbb275e69ca7143bd649e1174a56605853` |

Starts were **52.903 seconds apart**, above the five-second minimum. Collection stopped immediately at the index markup. No copyright, terms, former-government index, minister page, PDF or linked archive was subsequently requested. No 403 or connection reset occurred in this live run. The response bytes are retained under `data/staged/qld-diaries/snapshots/`; they were not used to enumerate ministers or file links after the stop. Simulated refusals in tests are separate from these live receipts.

Scoped Git attributes preserve raw snapshot and PDF bytes without newline conversion. Both staged response blobs were checked against their receipt SHA-256 values before committing.

The Cabinet **CC BY 3.0 AU** label remains the repo's previous finding. Its current copyright page was not checked because the stop occurred first. This is **unverified clearance**, not a finding that Queensland's licence prohibits reuse. No diary content was ingested under that old label.

| Year | Inventoried files / ministers | Historical rows staged | Completeness |
| --- | --- | --- | --- |
| 2013 | Unverified | 0 | Held |
| 2014 | Unverified | 0 | Held |
| 2015 | Unverified | 0 | Held |
| 2016 | Unverified | 0 | Held |
| 2017 | Unverified | 0 | Held |
| 2018 | Unverified | 0 | Held |
| 2019 | Unverified | 0 | Held |
| 2020 | Unverified | 0 | Held |
| 2021 | Unverified | 0 | Held |
| 2022 | Unverified | 0 | Held |
| 2023 | Unverified | 0 | Held |
| 2024 (through October) | Unverified | 0 | Held |

**Zero files inventoried; zero historical meetings staged.** Null file counts in the [inventory](../../../data/staged/qld-diaries/inventory.json) mean unknown, not an empty source series. All four repo-known period leads — 2013–2015, 2015–2017, 2017–2020 and 2020–2024 — have explicit held bundles with empty rows. Their candidate index URLs are not described as live-verified indexes. No former-minister, file-format or attachment-licence inventory is claimed. Official linked archives remain unvisited.

The current public export is unchanged: **35,893 QLD meetings, Nov 2024–Jul 2026**, within 61,499 combined NSW/QLD source rows. The historical cutoff is 31 October 2024; records from 1 November are excluded from the historical projection. Full-row reconciliation could not be performed: `access.json` contains summaries and newest samples, not a full file/page/row ledger. The optional reviewed export reads full existing QLD coordinates, gives them precedence, strips query aliases and deduplicates identical file hashes plus page and row. An existing file with missing coordinates is withheld as a whole. Synthetic October/November and repeated-file fixtures verify those rules; they do not establish a real source reconciliation.

Local changes extend `parli/ingest/ministerial_diaries.py`, including nested former-government discovery, numeric/word dates, continuation column preservation, current QLD fields, PDF page/row, snapshot hash and parse version. The synthetic 2013 PDF was rendered and visually inspected; it contains invented official-office labels, organisations and generic attendee placeholders, with no private names. The legacy minister linker also loses its first-initial/surname fallback.

`scripts/qld_diaries` isolates acquisition and offline staging from the legacy DB path. A stopped run remains stopped across restarts. Licence review happens before parsing; source, index and copyright snapshots are joined and checked again before export. Document restrictions, unsupported formats and outside-host documents remain held. `scripts/export_access.py --qld-stage` adds reviewed historical records to the existing access shape, with exact full QLD roster links only. It never adds attendee/donor joins, organisation entity links or aliases. Existing minister counts, person historical blocks and metadata-only Search can use cleared rows after later reviewed promotion. Attendees, organisations and raw purposes never enter historical Search titles, snippets or tokens. Per-record source lines show the PDF/page, older index, snapshot/hash, parse version and licence, with the influence caveat. Existing list/source-line patterns are used; no table was introduced.

The [app plan](app-plan.md) is documentation only. `docs/COVERAGE.md` now marks the historical lane held and records its years, counts, licence limit and cadence. Next #3, #5 and #8 change only “deployment pending” to “live in production since 14 Oct 2026”, as supplied by the orchestrator; this lane did not drive those production routes.

Validation: 12 Python parser/acquisition/export tests; 22 targeted Node tests (`qld-diaries`, `source-access`, `money-explain`); TypeScript; `npm run -s check`; Wrangler deploy dry run; offline historical stage dry run; source-access guard; `git diff --check`. The initial TypeScript run failed because generated Worker runtime types were absent in the fresh worktree. `check` generated them, and the subsequent TypeScript run passed. Context7 MCP was unavailable in this session; Wrangler flags were checked against installed CLI help and official Cloudflare documentation.

`votes.json` is byte-identical to the baseline, SHA-256 `7343a87c65b8bb09cef0e27660b5fa7b9434a9db0ef78d32e8ff6c6439e636ca`. `access.json` and the Search catalogue were not regenerated. No production KB/D1 writes, nightly, push, deploy, production Ask/generation/voice/auth calls or native code changes occurred. The orchestrator receives this local commit; source access and current rights must be resolved before a new reviewed acquisition and any data promotion.

**Merge note (15 Oct 2026):** only this report, the app plan, the COVERAGE.md updates and the compact receipts (robots.txt bytes, receipt ledger, inventory) are on `main`. The staging code, web changes and the 37 KB captured index HTML (hash in the receipt ledger) stay parked on branch `coverage/qld-diaries` at `02079ab6b` until source access clears and three review findings are fixed: the document licence gate must fail closed on abbreviated or "without permission" notices, `--offline` must never reach the live scraper, and the legacy scraper must keep its PDF-only filter.
