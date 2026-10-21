# SA historical grants: stage only

Status: **LIVE pending deploy**. Independent r2 APPROVE at `32af360d7` covers
the six unchanged inputs; the reviewed public asset is promoted locally.
See [promotion evidence](../../docs/coverage/sa-grants/promotion-round-3.md).
Future inputs require a new independent review receipt. Nightly stays off.

`acquire.py` calls the SA budget acquisition engine with its own locked ledger,
seven exact resource UUIDs, a seven-download cap, and permission for original
same-host storage links actually printed on the selected resource pages.
Robots first; OPAXBot; at least 5.11 seconds after completion; no automatic
redirects or proxies; persistent stop on 403/challenge/reset/timeout. Unsuccessful
and applicant resources fail scope validation before the transport is called.
Do not retry the five 404 originals or invent replacement URLs.

All acquisition is complete for this bounded run. Successful bodies are keyed by
SHA-256 in `portal/private/sa-grants/acquisition/`. Re-running the offline commands
makes zero source requests:

```sh
python3 -m scripts.sa_grants.stage
python3 -m scripts.sa_grants.check --dry-run
python3 -m unittest discover -s tests -p test_sa_grants.py
python3 scripts/promote_hub_data.py sa-grants --dry-run --votes-reference 9c7deab0d
```

The dry run now passes against the approved receipt. A pending receipt must
still reject `review: sa-grants`; approval must come from independent review.
Its input hashes
include the exact committed `series.jsonl` and `hub.json` plus inventory, receipts,
reconciliation and acquisition audit. A changed input invalidates approval.

`data/staged/sa-grants/series.jsonl` and `hub.json` are committed as authorised
source-record text under Jake's 19 October decision. Recipient names remain
within these records; no person entities, recipient facets or identity joins
are added. Commit messages, tests and fixtures contain no private names.
Raw CSV/workbook bodies and the local preview candidate remain private.
The [originals handoff](../../docs/coverage/sa-grants/report.md#originals-handoff)
records the durable Mac cache, every retained SHA-256, an offline restore and a
future re-acquisition command. A fresh clone has all six reviewable promotion
inputs; reproducing the source audit also needs the hash-verified originals.
`reviewed-staged` describes the file/row checks, not independent approval.

The CSV parser preserves Windows-1252 text, exact source strings, resource UUID
and logical CSV record number (header is row 1). A completely blank final record
is absent, never an award. Year comes from each publisher resource title, as
neither CSV has a year column. No amount total is computed: the files publish no
control total. Every row and amount is re-parsed from retained bytes by the gate.

All five PCIF original XLS links returned 404. No workbook or sheet contents
were acquired. The XLS parser is a conservative synthetic boundary test only;
no live sheet layout is approved and the serving renderer rejects PCIF amounts.
A future lawful original file requires new notices, successful-sheet boundary,
schema, reconciliation and independent review before any award can be staged.

Local actual-Worker preview, with all outbound Worker requests disabled:

```sh
OPAX_SA_GRANTS_PREVIEW_DATA=candidate node scripts/sa_grants/preview.mjs
python3 -m scripts.sa_grants.browser_check
```

Port 8978; no production bindings. Without the explicit candidate variable the
preview reads only the reviewed public asset. Round 3 browser proof uses this
promoted asset, with no candidate override. Browser
checks block every external URL and assert the 390/1440 table layout, hydration,
sorting and no-JavaScript phone rendering. Screenshots and metrics stay private.
The existing `/money/grants` page links to this separate historical register
only when a cleared serving asset exists. No recipient entities, facets,
directory joins, search catalogue or MCP additions are made.
