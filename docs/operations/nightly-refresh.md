# Nightly refresh (AWS EC2, starts itself, powers itself off)

The corpus is refreshed, published and deployed every night with no one at a keyboard. This
replaces the hand-run procedure (WSL desktop, then a laptop worktree, then a manual deploy).

Enrichment (topic labels, speech summaries) is **not** part of this: a Cloudflare Worker does that.
The nightly only brings new records in and publishes them.

## What happens each night

```
03:15 Sydney   EventBridge Scheduler "opax-refresh-start" starts the EC2 instance (opax-refresh)
   │
   ▼  boot → opax-nightly.service (oneshot, enabled at boot)
      run-nightly.sh   skips everything if ~/.config/opax/skip-nightly exists
      └─ scripts/vm/nightly.sh   (flock; log ~/.cache/autoresearch/pipeline/nightly-<date>.log)
   1  sync ~/opax with origin/main (drops any half-written data from a dead run)
   2  scripts/daily_refresh.sh with OPAX_SYNC_KB=1     ~1-2 h
        Hansards (federal, NSW, VIC, QLD, committees), AusTender, IPEA, bills, NSW releases
        → parli.db; new speeches + NSW releases → the knowledge box (KB); votes.json;
        bill files. `sa` always fails (source WAF) and is allowed to.
   3  bills: export_bills.py --fill-briefs, then verify_bill_briefs.py (no brief lost vs HEAD)
   4  validate_data.py: bills, votes.json (a failing group is reverted to HEAD, the rest goes on)
   5  update_corpus_manifest.py: corpus.json from the LIVE KB counts + daily.log; checked_at stamped
   6  bump_cache_epoch.py → CACHE_EPOCH "<date>-nightly" in both places, only if the KB changed
   7  git commit (data files only) as "OPAX nightly"; git push to main over SSH (deploy key),
      rebase-and-retry on a race
   8  force-push {status, failures} to the `nightly-status` branch (one parentless commit)
   ▼  ExecStopPost (also after a failure or the 4 h limit): poweroff-if-idle.sh
      apply security updates, then `systemctl poweroff` unless ~/.config/opax/hold exists or
      someone is logged in / connected over ssh
08:00 Sydney   EventBridge Scheduler "opax-refresh-stop-backstop" stops the instance if still up

the push (corpus.json changed) ──► .github/workflows/deploy.yml
      npm ci · build:search/social/grants-map/analytics/voice · node --test (Node 24)
      wrangler types + tsc · `npm run deploy` · commit restamped assets back with [skip ci]
09:30 Sydney   .github/workflows/refresh-watchdog.yml reads https://opax.com.au/corpus.json and the
               nightly-status branch; a red run (GitHub emails the owner) means the chain broke
```

**`corpus.json` is stamped every night.** `refresh.checked_at` is written when it is more than 12 hours
old, and always when anything else is being pushed. That makes every nightly commit change
`portal/public/corpus.json`, which is what starts the deploy, and it is what the watchdog reads. A night with
no new data therefore still makes a small commit and a deploy. Running the nightly again the same night
changes nothing.

**Only data files are ever committed:** `portal/public/bills/*`, `portal/public/votes.json`,
`portal/public/corpus.json`, `portal/wrangler.jsonc` (the two `CACHE_EPOCH` values). Nothing else.

There is no cache-warm step (deliberately).

## The machine

| | |
| --- | --- |
| Instance | `i-0d725823966c827b9`, name `opax-refresh`, ap-southeast-2a, `t4g.large` (2 vCPU, 8 GB, unlimited credits), Ubuntu 24.04 arm64, 58 GB gp3 root |
| Cost model | on for the refresh (1–2 h) only; the disk (about 40 GB used) is kept while it is stopped |
| Access | SSH key `~/.ssh/opax-refresh.pem` (on the Mac and the desktop), user `ubuntu`, security group SSH only from the home IP |
| Public IP | **changes at every stop/start**: `scripts/vm/ec2.sh ip` (or `aws ec2 describe-instances --region ap-southeast-2 --instance-ids i-0d725823966c827b9 --query 'Reservations[0].Instances[0].PublicIpAddress' --output text`) |
| Schedules | EventBridge Scheduler `opax-refresh-start` (03:15 Australia/Sydney) and `opax-refresh-stop-backstop` (08:00), role `opax-refresh-scheduler` (may only start/stop this instance). Created disabled: enable them after the first successful manual nightly |
| Shared account | the AWS account holds unrelated instances. Nothing here touches any resource other than the opax-refresh ones; `scripts/vm/ec2.sh` only names this instance |

**Disk is the tight resource** (58 GB): `parli.db` is 29 GB, the caches 3 GB, the Python environment 1.5 GB, the
OS and packages 6 GB, so about 18 GB stays free. The nightly refuses to start with less than 5 GB free
(`OPAX_MIN_FREE_GB`). Do not leave the compressed database snapshot on the disk after a transfer.

### Keeping the machine up for maintenance

The unit runs at **every boot**, so starting the instance by hand also starts a nightly. To log in without that:

```
scripts/vm/ec2.sh start --maintenance   # starts it, waits for ssh, then touches hold + skip-nightly and stops the run
scripts/vm/ec2.sh ssh                   # log in
scripts/vm/ec2.sh release               # remove hold and skip-nightly when you are done
scripts/vm/ec2.sh stop                  # or just stop it
```

* `~/.config/opax/hold`: after a run the machine does not power off (and skips the security updates).
* `~/.config/opax/skip-nightly`: the boot-time run is skipped (the machine still powers off afterwards unless held).
* Any interactive login, or any established connection on port 22 (ssh, scp, rsync), also stops the power-off, so an
  ssh session started while a nightly is running keeps the machine up when it ends. **Remember to log out** or
  the instance stays on until the 08:00 backstop.

## Where everything lives

| Thing | Where |
| --- | --- |
| Service | `/etc/systemd/system/opax-nightly.service` (template: `scripts/vm/systemd/`), enabled at cutover |
| Scripts | `~/opax/scripts/vm/{run-nightly.sh,nightly.sh,poweroff-if-idle.sh}` |
| Nightly log (one per date, appended if re-run) | `~/.cache/autoresearch/pipeline/nightly-YYYY-MM-DD.log` |
| Power-off / updates log | `~/.cache/autoresearch/pipeline/poweroff.log` |
| Last outcome, machine readable | `~/.cache/autoresearch/pipeline/nightly-last.json` (also published, see below) |
| Per-step refresh log / details | `~/.cache/autoresearch/pipeline/daily.log`, `<step>.log` |
| Database | `~/.cache/autoresearch/parli.db` (29 GB SQLite, WAL) |
| **KB push checkpoint** | `~/.cache/autoresearch/arag_sync_state.json` |
| Fetcher caches | `~/.cache/autoresearch/{hansard/modern,bills_v2,ipea,qld_parliament,nsw_hansard,sa_hansard,tvfy}` |
| Brief cache | `~/.cache/autoresearch/bill_speech_briefs.json` (+ `.checked.json`) |
| Secrets | `~/opax/.env` (mode 600), `~/.ssh/opax_deploy` (deploy key). Nothing in git |
| Published run status | branch `nightly-status`, file `status.json` (public; a single force-pushed commit) |

`~/opax` is a normal clone of `github.com/jaketracey/opax` on `main` (fetch over HTTPS, push over SSH). Nobody edits it by hand.

## Credentials

The repository is **public**: nothing below is ever committed, logged or published.

* **GitHub from the machine: a deploy key only.** `~/.ssh/opax_deploy` has write access to `jaketracey/opax`;
  `~/.ssh/config` maps `github.com` to it. There is **no GitHub token** on the machine, so the nightly cannot dispatch
  workflows or open issues. It pushes over SSH and the pushes start the deploy (path filter on `corpus.json`).
  Alerting is the watchdog workflow plus the published `nightly-status` branch (both need no credential).
  If `main` gets branch protection the deploy key must be allowed to push to it.
* **GitHub Actions secrets** (Settings → Secrets and variables → Actions), already set: `CLOUDFLARE_API_TOKEN`
  (account token "opax-github-actions-deploy": Workers Scripts, Routes, KV, R2, Tail, Observability write;
  Account Settings read) and `CLOUDFLARE_ACCOUNT_ID` (`459714503d7cbe9d0b7875e62526628b`). No Cloudflare credential lives on the VM.
* **`~/opax/.env`** (copy of the desktop's; `transfer_state.sh --copy-env` does it over ssh):

  | Variable | Used by |
  | --- | --- |
  | `ARAG_ZONE`, `ARAG_ACCOUNT`, `ARAG_KB_ID`, `ARAG_KB_TOKEN` (`ARAG_NUA_KEY` optional) | arag_sync, words_sync, publish_bills, bill briefs, corpus manifest |
  | `OPENAUSTRALIA_API_KEY` | federal Hansard download |
  | `TVFY_API_KEY` | TheyVoteForYou refresh |

  Never set `DATABASE_URL` there: `parli.db.get_db()` would switch to PostgreSQL. The nightly refuses to run if it is set.
* `~/.config/opax/nightly.env` holds only optional `OPAX_*` overrides.

## First-time setup

Everything is scripted and idempotent; nothing here is done implicitly.

1. **Provision** the instance (done). It needs the deploy key at `~/.ssh/opax_deploy` and an ssh config mapping `github.com` to it.
2. **Bootstrap** (on the machine, as `ubuntu`):
   ```
   ~/opax/scripts/vm/bootstrap.sh --fail2ban-ignore <your home IP>
   ```
   (from a fresh machine: `curl -fsSL https://raw.githubusercontent.com/jaketracey/opax/main/scripts/vm/bootstrap.sh | bash`).
   Installs packages, Australia/Sydney timezone, 4 GB swap, key-only SSH, fail2ban, `uv` and the locked
   Python environment, the clone (push url set to SSH), secret templates, and the systemd unit (**installed, not
   enabled**). Security updates are moved out of the background timers into the nightly power-off.
   `scripts/vm/bootstrap.sh --check` reports what is in place.
3. **Database and checkpoint**: `parli.db` and `arag_sync_state.json` must come from the same quiesced moment.
   The first cutover did this by hand (a consistent `sqlite3 .backup` snapshot on the desktop, zstd, rsync,
   decompress, `PRAGMA quick_check`, checkpoint copied at the same time). `scripts/vm/transfer_state.sh`
   automates the same thing (checkpoint, sha256, zstd, resumable rsync, verify, then move into place) and can top
   up later with `--mode delta`. It checks the free disk against the compressed file plus the database.
4. **Caches and the rest**: `SSH_OPTS="-i ~/.ssh/opax-refresh.pem -o IdentitiesOnly=yes" scripts/vm/transfer_state.sh --dest ubuntu@$(scripts/vm/ec2.sh ip) --only caches --copy-env`
   (run on the desktop), and from the Mac
   `scp -i ~/.ssh/opax-refresh.pem ~/.cache/autoresearch/bill_speech_briefs.json ubuntu@<ip>:.cache/autoresearch/`.
5. **Probe the sources** from the machine: `~/opax/.venv/bin/python ~/opax/scripts/vm/probe_sources.py`
   (see "Sources that may refuse a datacenter IP").
6. **Rehearse**: `OPAX_NIGHTLY_NO_PUSH=1 ~/opax/scripts/vm/nightly.sh`. Everything runs and commits locally; no
   `git push`, no status. **It does push new speeches to the KB**, so after this the desktop's pipeline must not run again.
7. **A real run**: `~/opax/scripts/vm/nightly.sh` (or `sudo systemctl start opax-nightly.service`), then check the deploy
   and `refresh-watchdog` (Actions → Refresh watchdog → Run workflow).
8. **Cut over**: on the desktop `scripts/vm/transfer_state.sh --mark-migrated`; on the machine
   `~/opax/scripts/vm/bootstrap.sh --enable` (it refuses if the state, secrets or deploy key are missing); then enable the
   two EventBridge schedules.

### The cutover rule

**After the machine's first successful nightly, the desktop must never run `daily_refresh.sh` with
`OPAX_SYNC_KB=1` again.** The KB push resumes from a per-machine checkpoint; two machines pushing
means duplicated resources and checkpoints that diverge. This is enforced: `--mark-migrated` writes
`~/.cache/autoresearch/MIGRATED_TO_VM` on the desktop, and `daily_refresh.sh` then exits 3 when
`OPAX_SYNC_KB=1` (a local-only refresh without it is still allowed). Only delete the marker to roll
back, and only if the machine has never pushed. `transfer_state.sh` also refuses to overwrite a machine
that has already run a nightly.

## Checking on it

The machine is off almost all day, so start with what needs no login:

* **The watchdog** (Actions → Refresh watchdog): green means `corpus.json` was stamped in the last 20 hours *and* the last
  nightly reported `ok`. Red means the VM did not run, did not push, the deploy failed, or the run reported problems (each
  problem is printed). GitHub emails the owner when a scheduled workflow fails.
* **`nightly-status`**: `git show origin/nightly-status:status.json` (or
  `https://raw.githubusercontent.com/jaketracey/opax/nightly-status/status.json`) →
  `{"date","status","started","finished","commit","deploy","summary","failures":[…]}`.
* **The deploy**: Actions → Deploy. A failed deploy opens a "Deploy failed <date>" issue.
* **The site**: `https://opax.com.au/corpus.json` → `version`, `refresh.checked_at`.

To read the logs, start the machine without triggering a run (`scripts/vm/ec2.sh start --maintenance`, then `ssh`):

```
systemctl status opax-nightly.service        # last run, exit status
journalctl -u opax-nightly.service --since yesterday
tail -n 80 ~/.cache/autoresearch/pipeline/nightly-$(TZ=Australia/Sydney date +%F).log
grep -E 'OK in|FAIL' ~/.cache/autoresearch/pipeline/daily.log | tail -20
tail ~/.cache/autoresearch/pipeline/poweroff.log
```

A source that is blocked for good will make the watchdog red every day; add its step to `OPAX_ALLOW_FAIL` (default `sa`) in
`~/.config/opax/nightly.env` once you have decided to live with the gap.

## Running it by hand

```
~/opax/scripts/vm/nightly.sh                              # the real thing (takes the lock)
sudo systemctl start opax-nightly.service                 # same, through systemd, including the power-off afterwards
OPAX_NIGHTLY_NO_PUSH=1 ~/opax/scripts/vm/nightly.sh       # everything but push and the status
OPAX_NIGHTLY_SKIP_REFRESH=1 ~/opax/scripts/vm/nightly.sh  # only the publish half (after a fix)
OPAX_ONLY=nsw,vic scripts/daily_refresh.sh                # debugging one step (add OPAX_SYNC_KB=1 only on the VM)
gh workflow run deploy.yml --ref main                     # from anywhere with gh: deploy without a refresh
```

It is safe to run twice: a lock stops overlap, each fetch is incremental, the KB push resumes from
its checkpoint, and if nothing differs from `origin/main` (and `checked_at` is under 12 hours old) nothing is committed.

Individual pieces (all run from `~/opax`, all read-only unless noted):

| Command | What it does |
| --- | --- |
| `python scripts/update_corpus_manifest.py --dry-run` | show the corpus.json diff against the live KB; writes nothing |
| `python scripts/update_corpus_manifest.py --always-stamp` / `--stamp-after-hours N` | also refresh `checked_at` |
| `python scripts/export_bills.py --fill-briefs portal/public/bills` | put speech briefs back (writes bill files) |
| `python scripts/verify_bill_briefs.py --base origin/main` | fail if any bill lost a brief |
| `python scripts/vm/validate_data.py bills votes corpus wrangler` | sanity-check what would be committed |
| `python scripts/bump_cache_epoch.py --date 2026-09-29` | set CACHE_EPOCH in both places |
| `python scripts/vm/probe_sources.py` | can this machine reach every source? |
| `scripts/vm/ec2.sh ip \| status \| start \| stop \| ssh \| release` | (laptop) find, start, stop, log in to the instance |

## How each piece behaves

**Failure policy.** The data steps fail soft; the nightly reports everything that went wrong at the
end (in `status.json`, so the watchdog can email) and keeps publishing whatever is still good.
- A refresh step that fails (other than `sa`) is recorded and the run continues.
- `link_speakers` or `classify` failing **blocks the KB push** (`OPAX_SYNC_GATE`): the push is permanent
  and moves the checkpoint, so it must not run on half-processed rows. It resumes next night.
- Bills that lost a brief, or fail validation, are reverted to HEAD; `votes.json` and the manifest still go.
- The manifest updater refusing (KB reports >1% fewer resources than the manifest, or a kind that
  will not answer) leaves `corpus.json` and `CACHE_EPOCH` alone. Then the push has no `corpus.json` change, so **the deploy does
  not start**; the status says so and the deploy has to be run by hand.
- The run stops outright only if the checkout cannot be synced, or `daily_refresh.sh` did not actually complete a run.
- Push race with a human: `git rebase origin/main` and retry, five times. A refused push (deploy key, network) leaves the
  commit local and it goes out on the next run.
- The power-off always happens (unless held), even if the run crashed or hit the 4 hour limit, so a hung run cannot leave a
  paid instance on all day. The 08:00 EventBridge backstop is the second guard.

**`corpus.json`** is written by `scripts/update_corpus_manifest.py` from three sources only: the live KB
(`counters()['resources']` and one `POST /catalog` per `kind` and `source` label), the last block of
`daily.log` (row deltas and the newest-date table), and the repo/DB (bill counts from `bills/index.json`,
newest NSW release from `parli.db`, read-only). When the KB changed since the manifest was written it updates
`version` (Sydney date), `expected_resources`, the breakdown (previous total plus what each kind gained, so it always
sums), `collected_speeches`, the matching `sources[].docs`, `resource_counts`, `raw_source_updates`, the
"Federal Hansard is current to …" line and `checked_at`. If the KB did not change it only moves the bill-derived and
newest-release fields when they moved, plus the daily `checked_at` stamp. Rows that report a slice rather than a whole
kind or source (GrantConnect notices, MLCI awards, AEC donations) and every hand-kept section (`known_defects`,
`enrichment`, `grants_research`, `structured_sources`, …) are never touched. It was checked by reproducing the 28 September
commit (`9e668760`) from the 21 September manifest against the live KB: identical except `checked_at`.
`corpus-stats.test.mjs` asserts structure (breakdown sums, ISO date, the PM and NSW rows), not numbers.

**Bill speech briefs.** The exporter writes `brief: null` on every speech; `--fill-briefs` restores them from the
brief cache, asks the KB about speeches it has not seen, and **re-asks about empty ones** (the enrichment Worker
writes briefs onto recent speeches after the first export): every empty speech dated in the last 60 days, and the
1,500 least-recently-checked older ones, each at most once per 20 hours (`--recheck-hours/-limit/--recent-days`).
Failed fetches never blank an existing brief. `index.json` is written in the committed layout
(`indent=1`) and keeps its old `generated_at` when nothing else changed, so a quiet night leaves no diff.

**Deploy workflow** (`.github/workflows/deploy.yml`): starts on a push to `main` that changes `portal/public/corpus.json`,
or by hand (Actions → Deploy → Run workflow); never on pull_request (the repo is public and the job holds the Cloudflare
token). Concurrency group `deploy-production`, no cancellation. The restamp commit it pushes back does not touch
`corpus.json`, carries `[skip ci]`, and the job refuses to run for the bot's own pushes, so it cannot loop. Restamps
commit only `portal/public/*.html` and the analytics bundles: `voice.js` and `chunks/` are left alone because esbuild bakes the
absolute checkout path into their hashes, so a CI build never matches the committed one. The `skip_tests` input is an
emergency escape hatch. It always uses `npm run deploy`, never a bare `wrangler deploy`.

**Watchdog** (`.github/workflows/refresh-watchdog.yml`): daily 09:30 Sydney (23:30 UTC). Fails if the live `corpus.json`'s
`refresh.checked_at` is older than 20 hours (a healthy night leaves it a few hours old, a missed night about 28), if the
status branch cannot be read or its last run is older than 30 hours, or if the last run's status is not `ok`. Run it by
hand from the Actions tab to test.

**Security updates** are applied by `poweroff-if-idle.sh` once per night (`apt-get update` then `unattended-upgrade`, 25 minute
limit) because the machine is off when the usual background timers would fire; those timers are switched off. The
power-off after them is the reboot, so a new kernel takes effect at the next start.

## Recovery

| Symptom | What to do |
| --- | --- |
| Watchdog red: "last nightly run: daily_refresh.sh reported failed steps: X" | Start the machine for maintenance and read `~/.cache/autoresearch/pipeline/X.log`. Usually a source outage (retries itself tomorrow: fetchers look back 30 days) or a WAF (next section). Nothing is lost. |
| Watchdog red: "live corpus.json was last stamped N h ago" | The instance did not start (check the EventBridge schedule and the instance), or the run failed before pushing, or the push happened but the Deploy workflow failed: check Actions → Deploy and `nightly-status`. |
| Watchdog red: "cannot read the nightly status" | The `nightly-status` branch is missing: the nightly has never finished a run with pushing enabled, or the deploy key cannot push branches. |
| Same step failing every night | `scripts/vm/probe_sources.py --only <name>` on the machine. If blocked, see below. |
| "did not complete a run" | `daily_refresh.sh` crashed or another run holds `daily_refresh.lock`. Look at the tail of `daily.log`. |
| "bill briefs lost … reverted" | The KB or the brief cache was unreachable/stale. Re-run `OPAX_NIGHTLY_SKIP_REFRESH=1 scripts/vm/nightly.sh`; if it repeats, `python scripts/verify_bill_briefs.py` names the speeches. |
| "update_corpus_manifest.py failed / REFUSED" | The KB answered oddly. Run it with `--dry-run` and read the message; rerun the publish half when the KB is healthy. `--allow-shrink` only after checking the KB really lost resources. |
| "could not push" | The commit stays local and the next run pushes it. Check the deploy key (`ssh -T git@github.com`) and branch protection. |
| "the deploy workflow did not start" | Run Actions → Deploy → Run workflow. |
| Deploy fails on a permission error | The Cloudflare token lacks a permission the Worker's bindings/routes need; the error names it. Add it to the token "opax-github-actions-deploy". |
| Disk filling (< 5 GB free: the nightly refuses) | `du -sh ~/.cache/autoresearch/*`; the WAL and `qld_parliament/pdfs/` grow; `sqlite3 parli.db 'PRAGMA wal_checkpoint(TRUNCATE)'` when idle. The disk can be grown in EC2 (then `sudo growpart /dev/nvme0n1 1 && sudo resize2fs /dev/root`). |
| Instance will not power off | `~/.config/opax/hold` exists, or something is connected to ssh (`who`, `ss -tn sport = :22`). |
| The instance is lost | New instance, `bootstrap.sh`, then restore `parli.db` and **`arag_sync_state.json`** from the same moment (a backup or the desktop copy). If the checkpoint is lost, do not run the push until it is rebuilt: `daily_refresh.sh` refuses `--full` without a sane checkpoint. |
| Roll back to the desktop | Only if the machine has never pushed to the KB: delete `MIGRATED_TO_VM` and disable the schedules. Otherwise copy the machine's `parli.db` and `arag_sync_state.json` back first. |
| After a merge of the nightly scripts to `main` | On the machine: `cd ~/opax && git fetch origin && git reset --hard origin/main` (the first checkout was made from a bundle of the same commits). |

## Sources that may refuse a datacenter IP

The fetchers all work from the desktop (a residential address). EC2 addresses are datacenter addresses, which WAFs
treat differently. `scripts/vm/probe_sources.py` sends one small request per source, shaped like the fetcher's, so this
is settled on the machine before cutover instead of by a red night.

**Measured from the instance itself (AWS ap-southeast-2, public IP in Amazon's Sydney range), 29 September 2026: every
source answered.**

| Step | Host | Fronted by | From the AWS Sydney IP |
| --- | --- | --- | --- |
| `fed_download` | www.openaustralia.org.au/api | Cloudflare | OK (API with key, 0.7 s) |
| `qld` | data.parliament.qld.gov.au, documents.parliament.qld.gov.au | Azure Front Door | OK (JSON API and a Hansard PDF range request) |
| `bills`, `committees` | parlinfo.aph.gov.au, www.aph.gov.au | Azure Front Door | OK (0.2–0.8 s) |
| `vic` | www.parliament.vic.gov.au | Cloudflare | OK |
| `nsw` | api.parliament.nsw.gov.au | Cloudflare | OK |
| `tvfy_refresh` | theyvoteforyou.org.au | Cloudflare (API key) | OK |
| `austender` | api.tenders.gov.au | CloudFront | OK |
| `releases_nsw` | www.nsw.gov.au | CloudFront | OK |
| `ipea` | data.gov.au | CloudFront | OK |
| KB push / read | *.progress.cloud | not a WAF | OK (630,777 resources) |
| `sa` | hansardsearch.parliament.sa.gov.au | Azure Front Door | 403, as from everywhere; allowed to fail |

That is one request per source. A WAF can still turn on a burst: `bills_fetch` sends about 300 ParlInfo requests a night
(it stops itself after a run of 403s), QLD downloads a PDF per sitting day, and Cloudflare and Azure rules can react to
volume or to a datacenter's reputation changing later. If a source starts refusing, the options are an egress through a
residential/AU proxy for that step only, running that one fetcher on the desktop and rsyncing its cache to the machine, or
accepting the gap and listing it in `source_limitations`. Re-run `scripts/vm/probe_sources.py` after any change of address
(the public IP changes at every start, though it stays inside Amazon's ranges).

## Tests

```
# unit tests (Python 3.10+, run in the pipeline venv or with `requests` installed)
python3 -m unittest scripts/test_update_corpus_manifest.py scripts/test_export_briefs.py scripts/test_export_drafts.py

# end-to-end scripts in a throwaway Ubuntu 24.04 (no network, no GitHub, no real KB)
docker run --rm -v "$PWD":/src:ro ubuntu:24.04 bash -c \
  'apt-get update -qq && apt-get install -y -qq git python3 python3-requests util-linux iproute2 >/dev/null && bash /src/scripts/vm/test_nightly.sh'
docker run --rm -v "$PWD":/src:ro ubuntu:24.04 bash -c \
  'apt-get update -qq && apt-get install -y -qq openssh-server openssh-client rsync zstd sqlite3 procps python3 >/dev/null && bash /src/scripts/vm/test_transfer.sh'

# portal (Node 24)
cd portal && npm run build:search && npm run build:social && npm run build:grants-map && npm run build:analytics && npm run build:voice && node --test test/*.test.mjs
```

`test_nightly.sh` runs `nightly.sh` against a bare "origin", a fake refresh and a KB snapshot: the happy night (main and the
status branch), an idempotent rerun, failed steps, lost briefs, a refresh that never ran, a push race, a quiet night that
still stamps, `NO_PUSH`, a failing manifest step, a refused push that heals on the next run (with and without a human commit
in between), `run-nightly.sh` and its skip file, `poweroff-if-idle.sh` (idle, hold, login, ssh connection, updates that
take long enough for someone to log in, failing updates), and the `daily_refresh.sh` allow-fail, KB-push gate and
cutover-marker behaviour. The unit itself was also run under real systemd in a container (ok, failing, held, skipped and hung
runs, with a shortened time limit).

## Not covered by the nightly

The daily refresh covers Hansards, NSW releases, bills, AusTender rows, IPEA and votes. A fuller refresh (grants,
the AusTender supplier register rebuild, donations, lobbyists, bill texts, QLD/VIC/Treasury releases, the money
maps and the static projections built from them) is still a manual job; see
`docs/operations/2026-09-21-corpus-refresh.md`. The manifest's hand-kept sections describe those and are left alone.
