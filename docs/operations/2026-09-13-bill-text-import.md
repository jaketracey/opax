# Federal bill text import — 13 September 2026

> **Stopped at the user’s request on 13 September 2026:** paid OpenRouter bill enrichment is paused. The `opax-bill-text-topics` task configuration was removed, and `opax-bill-text-publish-20260913.service` was stopped and disabled. The source-only crawler may continue collecting text; it makes no LLM calls. Published text remains available. Do not recreate the OpenRouter bill labeller or re-enable automatic publishing under the current instruction. The user intends to use Codex agents for labelling instead. Any later publishing workflow must also account for the KB’s existing automatic summaries, which can incur OpenRouter charges. The verification below records the earlier configuration, not its current enabled state.

This import adds original federal bill text to the existing bill pages and KB. It does not replace bill summaries, change their routes, or ingest Acts, explanatory memoranda or exposure-draft PDFs.

## Scope and evidence

The public projection contains **2,979 federal bill pages**. Initially **2,798** have unambiguous canonical ParlInfo billhome identities, **180** retain legacy ALRC identities, and **one** is an exposure draft without a billhome identity. The registry DB has 2,978 rows; the extra exposure draft is a separate projected page.

Legacy reconciliation preserves `au-federal-alrc-N` page keys. It considers registry source IDs, linked Acts' originating-bill codes and official bill listings, then requires an exact normalized title (including bill year and bill number) **and the earliest introduction date** on the official billhome. An Act link alone is only a candidate. Ambiguous or unverified matches remain unavailable. Initial cached evidence resolves ALRC4391 → r5824 and ALRC5160 → s1060, separate House/Senate introductions on 20/21 March 2017. Parliament 43 listings are initially absent from the cache and require a later source pass.

At **2026-09-13 03:28 UTC**, a read-only state snapshot showed 76 complete versions across 53 Parliament 48 bills: 319 sections and 3,779,432 source characters. Complete versions ranged from 1,835 to 338,438 characters (mean 49,729). This newest-first, current-parliament sample is strongly biased; it is not a defensible final storage or completion-time estimate. Raw HTML, SQLite metadata, exported JSON and KB representations add separate storage overhead. Counts change while acquisition runs.

## Completeness and provenance

Only observed billhome stage identifiers are acquired. Stages remain separate, for example `r7542_first-reps` and `r7542_aspassed`; discovery does not invent missing stages. The walker requests inline ParlInfo display sections from `0000` onward, with a maximum source rate of 0.7 requests/second. It does not request robots-disallowed `/parlInfo/download/` files.

A version is complete only after every contiguous section has readable text and the exact expected `System Id`, and the next section redirects to the same source site's summary endpoint. The stored terminal proof must account for all section rows. HTTP errors, missing identities, unreadable pages, interrupted work and the configurable section cap never mean complete. Successful sections commit independently and are reused on resume; malformed HTTP200 section documents are evicted from the HTTP cache so they can be retried. Five consecutive403 responses stop inline acquisition for operator review. The existing registry listing/homepage helper has its own bounded retries and refusal threshold; its blocked exception is also translated to exit130. Exhausted listing gaps are recorded in the reconciliation report and produce exit2, rather than an endless restart.

Source HTML hashes, section URLs, source dates and acquisition timestamps are retained. Plain text is the entire section sequence joined by exactly two newlines, without a character cap or model rewriting. Completeness describes the available inline source version, not a guarantee that PDF typography, diagrams or every stage ever issued is represented. Readers can open the official source for authoritative formatting.

The publisher refuses incomplete versions. Resources use `bill-text-{bill_key}-{stage}`, `kind/bill_text`, exact `bill_key/{bill_key}` and stage labels. Metadata includes the source-text SHA256 and section offsets in **UTF-16 code units**. The live endpoint checks SHA256 and Unicode character count before returning a complete body. It uses original `body`/`t-body` fields, never generated summaries. Catalog responses describe complete versions published so far, not exhaustive source-stage coverage.

## Host and commands

Run on `desktop` from `/home/jake/opax-bill-full-text`, using `/home/jake/opax/.venv/bin/python`. Keep this isolated source checkout updated when changing the importer; running Python processes retain their already loaded code.

```sh
cd /home/jake/opax-bill-full-text
BILL_TEXT_PY=/home/jake/opax/.venv/bin/python
BILL_TEXT_STATE=/home/jake/.cache/opax/bill-text-import-20260913
# Set this to the existing protected KB environment file; do not mint a token.
BILL_TEXT_ENV=/home/jake/opax/.env

# Local progress, no source or KB requests.
"$BILL_TEXT_PY" scripts/publish_bill_texts.py status --state-dir "$BILL_TEXT_STATE"

# Full newest-first acquisition, or resume the same state after interruption.
"$BILL_TEXT_PY" scripts/publish_bill_texts.py crawl \
  --state-dir "$BILL_TEXT_STATE" --browser-ua --source-rate 0.7

# Retry one bill; cached successful sections and completed versions are reused.
"$BILL_TEXT_PY" scripts/publish_bill_texts.py crawl \
  --state-dir "$BILL_TEXT_STATE" --browser-ua --keys au-federal-r7542

# Inspect pending KB writes locally, then publish complete versions.
"$BILL_TEXT_PY" scripts/publish_bill_texts.py publish \
  --state-dir "$BILL_TEXT_STATE" --dry-run
"$BILL_TEXT_PY" scripts/publish_bill_texts.py publish \
  --state-dir "$BILL_TEXT_STATE" --env "$BILL_TEXT_ENV" --rate 1

# Recheck remote content even for locally confirmed successful hashes.
"$BILL_TEXT_PY" scripts/publish_bill_texts.py publish \
  --state-dir "$BILL_TEXT_STATE" --env "$BILL_TEXT_ENV" --verify

# Optional consistent local JSON snapshot; live delivery uses published KB data.
"$BILL_TEXT_PY" scripts/publish_bill_texts.py export --state-dir "$BILL_TEXT_STATE"

# Offline legacy identity reconciliation; safe alongside the active source crawl.
"$BILL_TEXT_PY" scripts/publish_bill_texts.py reconcile --state-dir "$BILL_TEXT_STATE"

# AFTER the primary source crawler stops: source reconciliation then legacy text.
"$BILL_TEXT_PY" scripts/publish_bill_texts.py finish-legacy --state-dir "$BILL_TEXT_STATE"
```

Defaults read `/home/jake/.cache/autoresearch/bills_v2/billhome`, the adjacent listing cache, `/home/jake/.cache/autoresearch/parli.db`, and this checkout's `portal/public/bills`. Override `--home-cache`, `--registry-db`, `--bills-dir` or `--output-dir` explicitly when running elsewhere. `--refresh-discovery` checks billhome for newly linked stages; it does not replace already completed section bodies.

Do not run two source crawlers concurrently: each has its own limiter. `finish-legacy` intentionally follows the main crawl, including a pacing interval between its registry and section clients. KB publication can run concurrently with acquisition. Publication hashes are recorded only after successful create/update/unchanged responses, scoped by KB zone/id; failures retry, and `--verify` bypasses the local success cache.

## Continuous delivery and recovery

Persistent, enabled units were installed and confirmed active during this run. The source unit is `opax-bill-text-crawl-20260913.service`; the publisher unit is `opax-bill-text-publish-20260913.service`. Inspect their actual state before launching a manual source command:

```sh
systemctl --user status opax-bill-text-crawl-20260913.service \
  opax-bill-text-publish-20260913.service --no-pager
journalctl --user -u opax-bill-text-crawl-20260913.service -n 30 --no-pager
journalctl --user -u opax-bill-text-publish-20260913.service -n 30 --no-pager
```

`scripts/watch_bill_texts.py` publishes completed versions as the crawl advances. Its optional legacy follow-up must wait until the main source unit is stopped, with no restart pending, before starting `finish-legacy`; publication continues during that follow-up. The configured command is:

```sh
"$BILL_TEXT_PY" scripts/watch_bill_texts.py --state-dir "$BILL_TEXT_STATE" \
  --env "$BILL_TEXT_ENV" --crawl-unit opax-bill-text-crawl-20260913.service \
  --interval 60 --finish-legacy
```

Repository templates are `scripts/systemd/opax-bill-text-{crawl,publish}-20260913.service`. To install them on a replacement host or migrate from transient units, first stop publisher and crawler, install both templates in `~/.config/systemd/user/`, run `systemctl --user daemon-reload`, reset failed state, and enable both units with `--now`. Verify `FragmentPath` points to the installed files and `Transient=no` before relying on restart persistence. The user service manager must remain available after logout; lingering was already enabled on this host. `workflow-complete.json` prevents completed workflows from rerunning automatically after reboot; review/archive the receipt deliberately before starting a new workflow. Do not launch the manual follow-up as well as an enabled automatic follow-up.

`state.sqlite` is the durable acquisition and successful-publication state. Preserve it, its WAL/SHM companions while active, `http-cache/`, and the registry source caches. Use SQLite's backup mechanism for a consistent active backup. Export files are atomic and exporters serialize a consistent read snapshot. `identity-reconciliation.json` records source errors plus resolved, unresolved and ambiguous legacy candidates and never treats an unresolved identity as a successfully acquired bill.

Exit0 means the selected operation completed without an acquisition/publish failure; it does **not** mean every public bill has a source version. Each billhome/version has a bounded three attempts by default (`--source-attempts`). Crawl exit2 means the full selected pass finished with source gaps after those attempts; exit1 means an unexpected operational failure, and exit130 means interruption or repeated source refusal. Persistent source units must set `RestartPreventExitStatus=2 130` so permanent source gaps cannot prevent the legacy follow-up indefinitely. The publishing watcher records `workflow-complete.json` with both acquisition exit codes, raw bill/version counts and identity coverage; it can finish a workflow with a coverage-gap receipt after acquisition exit2; that receipt is not a claim of full corpus coverage. Inspect state notes, address the cause, then rerun against the same state. A failure fetching an available version remains incomplete; a missing source identity or a billhome with no linked inline versions remains explicitly unavailable. The exposure draft is outside this inline billhome acquisition path.

Live URLs are `/bill-texts/{bill_key}/index.json` and `/bill-texts/{bill_key}/{version_id}.json`; reading is `/bill/{bill_key}?text-version={version_id}#bill-full-text`. Successful manifests cache for60 seconds, bodies for one hour; failures are not negatively cached. `?nocache=1` bypasses this endpoint cache for verification. The summary and page remain usable if the full-text source is unavailable.

Validation: `python3 -m unittest discover -s tests -p test_bill_texts.py` and `node --test portal/test/bill-text-delivery.test.mjs portal/test/bill-text-reader.test.mjs` cover completeness, interrupted acquisition, exact legacy joins, publication caching, UTF-16 boundaries, checksum failures, stage selection and whole-text fallback.
