# Nightly refresh (Oracle VM)

The corpus is refreshed, published and deployed every night with no one at a keyboard. This
replaces the hand-run procedure (WSL desktop, then a laptop worktree, then a manual deploy).

Enrichment (topic labels, speech summaries) is **not** part of this: a Cloudflare Worker does that.
The nightly only brings new records in and publishes them.

## What happens each night

```
03:30 Sydney   systemd timer on the VM (opax-nightly.timer)
   │
   ▼  scripts/vm/nightly.sh   (flock; log ~/.cache/autoresearch/pipeline/nightly-<date>.log)
   1  sync ~/opax with origin/main (drops any half-written data from a dead run)
   2  scripts/daily_refresh.sh with OPAX_SYNC_KB=1     ~1-2 h
        Hansards (federal, NSW, VIC, QLD, committees), AusTender, IPEA, bills, NSW releases
        → parli.db; new speeches + NSW releases → the knowledge box (KB); votes.json;
        bill files. `sa` always fails (source WAF) and is allowed to.
   3  bills: export_bills.py --fill-briefs, then verify_bill_briefs.py (no brief lost vs HEAD)
   4  validate_data.py: bills, votes.json (a failing group is reverted to HEAD, the rest goes on)
   5  update_corpus_manifest.py: corpus.json from the LIVE KB counts + daily.log
   6  bump_cache_epoch.py → CACHE_EPOCH "<date>-nightly" in both places, only if the KB changed
   7  git commit (data files only) as "OPAX nightly", push to main (rebase-and-retry on a race)
   8  gh workflow run deploy.yml                          ← GitHub Actions takes over
        │
        ▼  .github/workflows/deploy.yml   (workflow_dispatch only)
        npm ci · build:search/social/grants-map/analytics/voice · node --test (Node 24)
        wrangler types + tsc · `npm run deploy` · commit restamped assets back with [skip ci]
```

A night on which nothing changed commits nothing, dispatches nothing, and exits 0.

**Only data files are ever committed:** `portal/public/bills/*`, `portal/public/votes.json`,
`portal/public/corpus.json`, `portal/wrangler.jsonc` (the two `CACHE_EPOCH` values). Nothing else.

There is no cache-warm step (deliberately).

## Where everything lives

| Thing | Where |
| --- | --- |
| Timer / service | `/etc/systemd/system/opax-nightly.{timer,service}` (templates: `scripts/vm/systemd/`) |
| The script | `~/opax/scripts/vm/nightly.sh` |
| Nightly log (one per date, appended if re-run) | `~/.cache/autoresearch/pipeline/nightly-YYYY-MM-DD.log` |
| Last outcome, machine readable | `~/.cache/autoresearch/pipeline/nightly-last.json` |
| Per-step refresh log / details | `~/.cache/autoresearch/pipeline/daily.log`, `<step>.log` |
| Database | `~/.cache/autoresearch/parli.db` (29 GB SQLite, WAL) |
| **KB push checkpoint** | `~/.cache/autoresearch/arag_sync_state.json` |
| Fetcher caches | `~/.cache/autoresearch/{hansard/modern,bills_v2,ipea,qld_parliament,nsw_hansard,sa_hansard,tvfy}` |
| Brief cache | `~/.cache/autoresearch/bill_speech_briefs.json` (+ `.checked.json`) |
| Secrets | `~/opax/.env` and `~/.config/opax/nightly.env` (both mode 600, never committed) |

`~/opax` is a normal clone of `github.com/jaketracey/opax` on `main`. Nobody edits it by hand.

## Secrets and tokens

Nothing below is committed; the repository is **public**, so none of it may appear in an issue or
log either (issue text goes through `scripts/vm/scrub_log.py`, which masks every value in the two
env files plus key/token/Bearer shapes).

**GitHub → Settings → Secrets and variables → Actions**

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token allowed to deploy the `opax-portal` Worker (Workers Scripts: Edit, plus whatever the bindings need: KV, D1, R2) |
| `CLOUDFLARE_ACCOUNT_ID` | `459714503d7cbe9d0b7875e62526628b` |

**VM `~/.config/opax/nightly.env`**

| Variable | Value |
| --- | --- |
| `GH_TOKEN` | A fine-grained PAT on `jaketracey/opax` only: **Contents: Read & write**, **Actions: Read & write** (to dispatch the workflow), **Issues: Read & write** (failure issues), Metadata: Read. It authenticates `git push` (via `gh auth git-credential`), `gh workflow run` and `gh issue`. If `main` is protected, the token's owner must be allowed to push to it. |

**VM `~/opax/.env`** (copy from the desktop's; `transfer_state.sh --copy-env` can do it)

| Variable | Used by |
| --- | --- |
| `ARAG_ZONE`, `ARAG_ACCOUNT`, `ARAG_KB_ID`, `ARAG_KB_TOKEN` (`ARAG_NUA_KEY` optional) | arag_sync, words_sync, publish_bills, bill briefs, corpus manifest |
| `OPENAUSTRALIA_API_KEY` | federal Hansard download |
| `TVFY_API_KEY` | TheyVoteForYou refresh |

Never set `DATABASE_URL` there: `parli.db.get_db()` would switch to PostgreSQL. The nightly refuses to run if it is set.

No Cloudflare credential lives on the VM: deploys happen in GitHub Actions.

## First-time setup

Everything is scripted and idempotent; nothing here is done implicitly.

1. **Provision** the VM (Ubuntu 24.04, aarch64, Sydney). Add your SSH public key to the default user.
2. **Bootstrap** (on the VM, as the pipeline user, with sudo):
   ```
   curl -fsSL https://raw.githubusercontent.com/jaketracey/opax/main/scripts/vm/bootstrap.sh | bash
   ```
   Installs packages, Australia/Sydney timezone, 8 GB swap, `gh`, unattended security upgrades
   (reboots only at 12:00), key-only SSH, fail2ban, `uv` + the locked Python environment, the clone,
   secret templates, and the systemd units (**installed, not enabled**). Check anything later with
   `scripts/vm/bootstrap.sh --check`. Options: `--user`, `--time HH:MM`, `--swap`, `--container` (testing).
   If the user is not `jake`, it links `/home/jake` to the home directory for the older scripts that hard-code it.
3. **Fill in** `~/opax/.env` and `~/.config/opax/nightly.env` (above).
4. **Probe the sources** from the VM (see "Sources that may refuse a datacenter IP"):
   `~/opax/.venv/bin/python ~/opax/scripts/vm/probe_sources.py`
5. **Transfer state** from the desktop (WSL up, pipeline stopped, nothing writing `parli.db`):
   ```
   SSH_OPTS="-i ~/.ssh/oracle.key" scripts/vm/transfer_state.sh --dest ubuntu@<vm-ip> --copy-env
   scp ~/.cache/autoresearch/bill_speech_briefs.json ubuntu@<vm-ip>:.cache/autoresearch/    # from the Mac
   ```
   It checkpoints the WAL, sha256s and zstd-compresses `parli.db`, sends it with resumable rsync,
   verifies sha256 **and** `PRAGMA quick_check` on the VM, and only then moves it into place. It
   also sends the push checkpoint (last, after checking nothing moved it) and the caches.
   Re-run with `--mode delta` later to top up (block-delta of the raw file).
6. **Rehearse**: `OPAX_NIGHTLY_NO_PUSH=1 ~/opax/scripts/vm/nightly.sh`. Everything runs and commits
   locally; no `git push`, no deploy, no issue. **It does push new speeches to the KB**, so after this
   the desktop's pipeline must not run again either (see the cutover rule).
7. **Cut over**: on the desktop `scripts/vm/transfer_state.sh --mark-migrated`; on the VM
   `~/opax/scripts/vm/bootstrap.sh --enable-timer` (it refuses if the state or secrets are missing).

### The cutover rule

**After the VM's first successful nightly, the desktop must never run `daily_refresh.sh` with
`OPAX_SYNC_KB=1` again.** The KB push resumes from a per-machine checkpoint; two machines pushing
means duplicated resources and checkpoints that diverge. This is enforced: `--mark-migrated` writes
`~/.cache/autoresearch/MIGRATED_TO_VM` on the desktop, and `daily_refresh.sh` then exits 3 when
`OPAX_SYNC_KB=1` (a local-only refresh without it is still allowed). Only delete the marker to roll
back, and only if the VM has never pushed. `transfer_state.sh` also refuses to overwrite a VM that
has already run a nightly.

## Checking on it

```
systemctl list-timers opax-nightly.timer            # next run
systemctl status opax-nightly.service               # last run, exit status
journalctl -u opax-nightly.service --since yesterday
cat ~/.cache/autoresearch/pipeline/nightly-last.json    # {"date","status","commit","deploy","summary","failures"}
tail -n 80 ~/.cache/autoresearch/pipeline/nightly-$(TZ=Australia/Sydney date +%F).log
grep -E 'OK in|FAIL' ~/.cache/autoresearch/pipeline/daily.log | tail -20
```

From anywhere: a failed night opens (or comments on) a GitHub issue titled **"Nightly refresh failed
YYYY-MM-DD"**; a failed deploy opens **"Deploy failed YYYY-MM-DD"**. The Actions tab shows the
Deploy runs, and `portal/public/corpus.json`'s `version` / `refresh.checked_at` show the last night
the knowledge box changed.

## Running it by hand

```
~/opax/scripts/vm/nightly.sh                              # the real thing (takes the lock)
sudo systemctl start opax-nightly.service                 # same, through systemd
OPAX_NIGHTLY_NO_PUSH=1 ~/opax/scripts/vm/nightly.sh       # everything but push / deploy / issue
OPAX_NIGHTLY_SKIP_REFRESH=1 ~/opax/scripts/vm/nightly.sh  # only the publish half (after a fix)
OPAX_ONLY=nsw,vic scripts/daily_refresh.sh                # (debugging one step; add OPAX_SYNC_KB=1 only on the VM)
gh workflow run deploy.yml --repo jaketracey/opax --ref main   # deploy without a refresh
```

It is safe to run twice: a lock stops overlap, each fetch is incremental, the KB push resumes from
its checkpoint, and if nothing differs from `origin/main` nothing is committed.

Individual pieces (all run from `~/opax`, all read-only unless noted):

| Command | What it does |
| --- | --- |
| `python scripts/update_corpus_manifest.py --dry-run` | show the corpus.json diff against the live KB; writes nothing |
| `python scripts/update_corpus_manifest.py --always-stamp` | also refresh `checked_at` when nothing else moved |
| `python scripts/export_bills.py --fill-briefs portal/public/bills` | put speech briefs back (writes bill files) |
| `python scripts/verify_bill_briefs.py --base origin/main` | fail if any bill lost a brief |
| `python scripts/vm/validate_data.py bills votes corpus wrangler` | sanity-check what would be committed |
| `python scripts/bump_cache_epoch.py --date 2026-09-29` | set CACHE_EPOCH in both places |
| `python scripts/vm/probe_sources.py` | can this machine reach every source? |

## How each piece behaves

**Failure policy.** The data steps fail soft; the nightly reports everything that went wrong at the
end and keeps publishing whatever is still good.
- A refresh step that fails (other than `sa`) is recorded, the run continues, and an issue is opened.
- `link_speakers` or `classify` failing **blocks the KB push** (`OPAX_SYNC_GATE`): the push is permanent
  and moves the checkpoint, so it must not run on half-processed rows. It resumes next night.
- Bills that lost a brief, or fail validation, are reverted to HEAD; `votes.json` and the manifest still go.
- The manifest updater refusing (KB reports >1% fewer resources than the manifest, or a kind that
  will not answer) leaves `corpus.json` and `CACHE_EPOCH` alone.
- The run stops outright only if the checkout cannot be synced, or `daily_refresh.sh` did not actually
  complete a run.
- Push race with a human: `git rebase origin/main` and retry, five times.
- Deploy dispatch failing, or no `GH_TOKEN`: the push still happens; the issue says to run the workflow by hand.

**`corpus.json`** is now written by `scripts/update_corpus_manifest.py` from three sources only: the live KB
(`counters()['resources']` and one `POST /catalog` per `kind` and `source` label), the last block of
`daily.log` (row deltas and the newest-date table), and the repo/DB (bill counts from `bills/index.json`,
newest NSW release from `parli.db`, read-only). When the KB changed since the manifest was written it updates
`version`, `expected_resources`, the breakdown (previous total plus what each kind gained, so it always sums),
`collected_speeches`, the matching `sources[].docs`, `resource_counts`, `raw_source_updates`, the
"Federal Hansard is current to …" line and `checked_at`. If the KB did not change it only moves the
bill-derived and newest-release fields, and only if they moved; otherwise it writes nothing. Rows that report a
slice rather than a whole kind or source (GrantConnect notices, MLCI awards, AEC donations) and every
hand-kept section (`known_defects`, `enrichment`, `grants_research`, `structured_sources`, …) are never touched.
It was checked by reproducing the 28 September commit (`9e668760`) from the 21 September manifest against the live
KB: identical except `checked_at`. `corpus-stats.test.mjs` now asserts structure (breakdown sums, ISO date, the PM
and NSW rows present), not numbers, so nightly updates need no test edits.

**Bill speech briefs.** The exporter writes `brief: null` on every speech; `--fill-briefs` restores them from the
brief cache, asks the KB about speeches it has not seen, and **re-asks about empty ones** (the enrichment Worker
writes briefs onto recent speeches after the first export): every empty speech dated in the last 60 days, and the
1,500 least-recently-checked older ones, each at most once per 20 hours (`--recheck-hours/-limit/--recent-days`).
Failed fetches never blank an existing brief. `index.json` is written in the committed layout
(`indent=1`) and keeps its old `generated_at` when nothing else changed, so a quiet night leaves no diff.

**Deploy workflow** (`.github/workflows/deploy.yml`): `workflow_dispatch` only (never push, never pull_request:
the repo is public and the job holds the Cloudflare token). Concurrency group `deploy-production`, no cancellation.
The `skip_tests` input is an emergency escape hatch. It always uses `npm run deploy`, never a bare `wrangler deploy`.

## Recovery

| Symptom | What to do |
| --- | --- |
| Issue "Nightly refresh failed …: daily_refresh.sh reported failed steps: X" | Read `~/.cache/autoresearch/pipeline/X.log`. Usually a source outage (retries itself tomorrow: fetchers look back 30 days) or a WAF (next section). Nothing is lost. |
| Same step failing every night | Probe it: `scripts/vm/probe_sources.py --only <name>`. If blocked, see below. |
| "did not complete a run" | `daily_refresh.sh` crashed or another run holds `daily_refresh.lock`. `pgrep -af daily_refresh`; look at the tail of `daily.log`. |
| "bill briefs lost … reverted" | The KB or the brief cache was unreachable/stale. Re-run `OPAX_NIGHTLY_SKIP_REFRESH=1 scripts/vm/nightly.sh`; if it repeats, `python scripts/verify_bill_briefs.py` names the speeches. |
| "update_corpus_manifest.py failed / REFUSED" | The KB answered oddly. Run it with `--dry-run` and read the message; rerun the publish half when the KB is healthy. `--allow-shrink` only after checking the KB really lost resources. |
| "could not push" | The commit stays local; the next run rebases and pushes it. Check the token and branch protection. |
| "cannot dispatch deploy.yml" / deploy red | Fix, then `gh workflow run deploy.yml --ref main` (or Actions → Deploy → Run workflow). Data on `main` is already correct. |
| Data on the site looks stale but nightly is green | Check the Deploy run finished; the manifest `version`; that `CACHE_EPOCH` on main was bumped. |
| Disk filling (< 15 GB free: the nightly refuses) | `du -sh ~/.cache/autoresearch/*`; the WAL and `pdfs/` grow; `sqlite3 parli.db 'PRAGMA wal_checkpoint(TRUNCATE)'` when idle. |
| The VM is lost | Re-run bootstrap on a new VM and `transfer_state.sh` from a copy of `parli.db` and **`arag_sync_state.json`** (or, if the checkpoint is lost, do not run the push until it is rebuilt: `daily_refresh.sh` refuses `--full` without a sane checkpoint). |
| Roll back to the desktop | Only if the VM has never pushed to the KB: delete `MIGRATED_TO_VM` and disable the timer. Otherwise copy the VM's `parli.db` and `arag_sync_state.json` back first. |

## Sources that may refuse a datacenter IP

The fetchers all work from the desktop (a residential address). Oracle's ranges are datacenter addresses, which
WAFs treat differently. `scripts/vm/probe_sources.py` sends one small request per source, shaped like the fetcher's,
so this can be settled on the VM before cutover instead of by a red night. Assessment from the hosts' headers
(not tested from a datacenter address):

| Step | Host | Fronted by | Risk from a datacenter IP |
| --- | --- | --- | --- |
| `fed_download` | www.openaustralia.org.au/api | Cloudflare | **High.** Cloudflare challenges the site's pages already. The API with a key works from the desktop today; on a datacenter IP it may be challenged. Fallback: run only `download_hansard_fast.py` on the desktop on sitting weeks and rsync `hansard/modern/`, or a small proxy. |
| `qld` | data.parliament.qld.gov.au, documents.parliament.qld.gov.au | Azure Front Door WAF | **High.** Already JS-challenges non-browser User-Agents (the fetcher sends a browser-shaped one). SA sits behind the same WAF and is refused outright. |
| `bills`, `committees` | parlinfo.aph.gov.au, www.aph.gov.au | Azure Front Door | **High.** ParlInfo refuses the honest OPAX User-Agent with 403 (the fetcher uses a Firefox one). `bills_fetch` is cache-first (`bills_v2/` is transferred) so a night is ~300 requests; it stops itself after a run of 403s. |
| `vic` | www.parliament.vic.gov.au | Cloudflare | Medium |
| `nsw` | api.parliament.nsw.gov.au | Cloudflare | Medium (slow: 3 s to answer today) |
| `tvfy_refresh` | theyvoteforyou.org.au | Cloudflare (API key) | Medium |
| `austender` | api.tenders.gov.au | CloudFront | Low–medium |
| `releases_nsw` | www.nsw.gov.au | CloudFront | Low–medium |
| `ipea` | data.gov.au | CloudFront | Low |
| KB push / read | *.progress.cloud | — | Low (API keys, not a WAF) |
| `sa` | hansardsearch.parliament.sa.gov.au | Azure Front Door | Already refused everywhere; allowed to fail |

Federal Hansard, QLD and the committee hearings only matter in sitting weeks, and each step looks back 30
days, so a blocked night self-heals when the block lifts or a different egress is used. If a source is blocked for
good, options are: an egress via a residential/AU proxy for that step only, running that one fetcher on the desktop
and rsyncing its cache to the VM, or accepting the gap and saying so in `source_limitations`.

## Tests

```
# unit tests (Python 3.10+, run in the pipeline venv or with `requests` installed)
python3 -m unittest scripts/test_update_corpus_manifest.py scripts/test_export_briefs.py scripts/test_export_drafts.py

# end-to-end scripts in a throwaway Ubuntu 24.04 (no network, no GitHub, no real KB)
docker run --rm -v "$PWD":/src:ro ubuntu:24.04 bash -c \
  'apt-get update -qq && apt-get install -y -qq git python3 python3-requests util-linux >/dev/null && bash /src/scripts/vm/test_nightly.sh'
docker run --rm -v "$PWD":/src:ro ubuntu:24.04 bash -c \
  'apt-get update -qq && apt-get install -y -qq openssh-server openssh-client rsync zstd sqlite3 procps python3 >/dev/null && bash /src/scripts/vm/test_transfer.sh'

# portal (Node 24)
cd portal && npm run build:search && npm run build:social && npm run build:grants-map && npm run build:analytics && npm run build:voice && node --test test/*.test.mjs
```

`test_nightly.sh` runs `nightly.sh` against a bare "origin", a fake refresh, a fake `gh` and a KB snapshot: the happy
night, an idempotent rerun, failed steps, lost briefs, a refresh that never ran, a push race, a refused push that heals on
the next run (with and without a human commit in between), no token, `NO_PUSH`, and the `daily_refresh.sh` allow-fail,
KB-push gate and cutover-marker behaviour (71 checks).

## Not covered by the nightly

The daily refresh covers Hansards, NSW releases, bills, AusTender rows, IPEA and votes. A fuller refresh (grants,
the AusTender supplier register rebuild, donations, lobbyists, bill texts, QLD/VIC/Treasury releases, the money
maps and the static projections built from them) is still a manual job; see
`docs/operations/2026-09-21-corpus-refresh.md`. The manifest's hand-kept sections describe those and are left alone.
