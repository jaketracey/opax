# ACT notifiable invoices: stage and review only

Dataset `kzmf-7uhp`; eight source fields. Read the [lane report](../../docs/coverage/act-invoices/report.md).
No nightly job, push, deployment, remote database command or production request.

Acquisition is deliberately manual, one sequential command at a time:

```sh
python3 -m scripts.act_invoices.acquire https://www.data.act.gov.au/robots.txt robots
python3 -m scripts.act_invoices.acquire https://www.data.act.gov.au/api/views/kzmf-7uhp.json metadata
python3 -m scripts.act_invoices.acquire https://www.data.act.gov.au/Government-and-Transparency/Notifiable-Invoices-Register/kzmf-7uhp page
python3 -m scripts.act_invoices.acquire https://www.data.act.gov.au/api/views/kzmf-7uhp/rows.json data
```

These exact URLs are already receipted and successful bodies are cached locally.
The export URL is linked by the publisher page. Every non-robots URL, including
its query string, must pass the freshly retained robots policy before a request.
The SA/Queensland robots matcher, no-redirect handler and refusal predicate are
reused. An exclusive process lock covers pacing and ledger updates. Wait at least
5.11 seconds after completion or the longer robots delay. A refusal, challenge,
reset, timeout, disallowed URL or incomplete download persists a hold and stops
further requests, staging and promotion. No retry or alternative route after a
hold. The licence is checked from this dataset's metadata before the data GET.

Offline checks:

```sh
python3 -m scripts.act_invoices.stage
python3 -m scripts.act_invoices.check --dry-run
python3 scripts/promote_hub_data.py act-invoices --dry-run --votes-reference 6b021dc84
```

The last command must reject the pending review. Never self-approve it. The
review receipt hashes every input, including the ignored source-record series.
Raw originals and supplier-bearing `series.jsonl` stay local, outside Git. An
independent reviewer can reproduce them from the hash-verified originals handoff
in the report. Schema evidence omits Socrata's supplier-bearing cached samples.

After independent approval, the existing promoter's explicit `act-invoices`
mode writes **`data/promoted/act-invoices/table.json`**, outside `portal/public`
and outside Git. It contains the reviewed original series and source receipt.
Do not run that promotion in this lane. An orchestrator must carry that approved
artifact into its build checkout for the ACT-specific reload. `load_tables.mjs`
verifies its series digest and snapshot coordinates, creates the ACT table and
stores its receipt in `table_meta`. The shared `OPAX_TABLE_RELOAD=on` deploy lane
then loads it; never run the remote reload from this Mac.

An ordinary build without that private artifact **preserves** existing approved
ACT rows and their receipt. It neither clears nor refreshes them. On a new
database, the absent receipt leaves the page and API unavailable. Missing,
changed or unapproved artifacts cannot yield a partial ACT refresh.

Local candidate proof (no approval or promotion):

```sh
OPAX_TEST_HOST=::1 OPAX_ACT_INVOICES_PREVIEW=candidate node scripts/act_invoices/preview.mjs
python3 -m scripts.act_invoices.browser_check
```

Port 8982; all outbound requests disabled. Candidate SQL and its test-only
receipt live in an isolated local D1. Stop the process with its tool session or
its own recorded PID. Screenshots and logs stay in `portal/private/act-invoices`.
