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
Do not run that promotion in this lane. Fix 1 adds the reviewed public release
asset transfer below so Actions can obtain that approved source mirror. `load_tables.mjs`
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

## Fix 1: reviewed public release delivery

GitHub release assets on **`jaketracey/opax` are public**. This is intentional and
approved for the publisher's CC BY 4.0 source records. The gzip JSON mirror has
an embedded `README`, dataset/source/snapshot/licence attribution and the eight
published fields plus source-row provenance. It has no supplier index, joins,
profiles, financial-year fields or derived numeric amounts. The table loader
reconstructs display fields after verification. Source/CSV values stay unchanged.

The only tracked file in `data/promoted/act-invoices/` is **`release.json`**. The
current manifest describes a **pending candidate**, not an uploaded or approved
release. Neither CI nor the publisher accepts that candidate for production.

After independent approval, the orchestrator follows these steps from the repo
root. Approval and external operations are not performed by this fix lane.

1. Ensure the independently reviewed code commit exists on GitHub through the
   orchestrator’s normal review/promotion process, so it can be the release tag
   target. This lane has not pushed that commit. Record the independently approved commit and the unchanged source input
   digests in `data/staged/act-invoices/review.json`; commit that approval receipt.
2. Validate, then promote the reviewed snapshot offline:

   ```sh
   python3 scripts/promote_hub_data.py act-invoices --dry-run --votes-reference 6b021dc84
   python3 scripts/promote_hub_data.py act-invoices --votes-reference 6b021dc84
   ```

3. Build the approved bundle and small manifest without uploading:

   ```sh
   node scripts/act_invoices/publish_bundle.mjs
   ```

   Inspect `data/promoted/act-invoices/release.json`, the printed byte count/hash,
   and `portal/private/act-invoices/release/README.md`. The default command is a
   local dry run. The tag and asset include the approved commit prefix, so a
   later review does not overwrite an existing release. `--tag` and `--asset`
   allow an explicit unique revision; use the same options for upload.

4. Create that public release if its tag does not yet exist, then explicitly
   upload. The script does not create releases or overwrite existing assets.

   ```sh
   act_release_tag="$(node -p 'JSON.parse(require("fs").readFileSync("data/promoted/act-invoices/release.json")).release_tag')"
   act_reviewed_commit="$(node -p 'JSON.parse(require("fs").readFileSync("data/promoted/act-invoices/release.json")).review.reviewed_commit')"
   gh release create "$act_release_tag" --repo jaketracey/opax --target "$act_reviewed_commit" --title "ACT invoice source mirror" --notes-file portal/private/act-invoices/release/README.md
   node scripts/act_invoices/publish_bundle.mjs --upload
   ```

   Only `--upload` runs `gh release upload`. It rechecks the approved promoted
   artifact and matching review receipt first. Do not use `--clobber` or replace
   an asset beneath an already committed hash.

5. Commit the approved `release.json` with the approval receipt, integrate the
   reviewed code and manifest into `main`, and enable the repository variable
   `OPAX_TABLE_RELOAD=on`. The orchestrator may then run the existing Deploy
   workflow on `main` through its usual release process.

   ```sh
   gh workflow run deploy.yml --repo jaketracey/opax --ref main
   ```

   No command in these external steps was run by this lane.

6. Verify Actions: **Prepare reviewed ACT invoice release** must report `ready`,
   followed by the existing SQL build, preflight, D1 reload and smoke checks.
   The step uses `gh release download` for the exact manifest tag/name and
   checks compressed size/SHA-256, decompressed size/SHA-256, source schema and
   the committed approved review receipt. It atomically places the verified
   mirror at `data/promoted/act-invoices/table.json` for `table-snapshot.mjs`.
   Verify the production page and paged table API against that snapshot and
   row count, without calling Ask, generation, voice or auth.

The preparation step is skipped when table reload is off. A missing, refused,
corrupt or unapproved asset emits a warning, a held step output and a run summary;
ACT is excluded from the reload and its last approved D1 rows/receipt stay.
Other tables may still reload. The output status also disables ACT input if a
stale local artifact exists. No ACT portal fetch or nightly acquisition occurs.

Offline lane dry runs (never upload or contact GitHub/ACT):

```sh
node scripts/act_invoices/publish_bundle.mjs --candidate
OPAX_TABLE_RELOAD=on node scripts/act_invoices/prepare_release.mjs --dry-run
OPAX_TABLE_RELOAD=off node scripts/act_invoices/prepare_release.mjs --dry-run
```

The first builds a clearly pending source mirror from hash-verified retained
staging for size/content review. The second validates the actual workflow file
and reports a hold for the pending manifest; the third reports skipped.
