# Periodic refresh: the sources the nightly does not touch

Runbook for refreshing the one-off data sources (government releases, GrantConnect, state donations,
lobbyist registers, FITS, IPEA, diaries, interests, rosters, contracts, FRL Acts) and the static JSON
exports built from them, **unattended on the nightly VM**. It is the contract between the prerequisites
in this change and the weekly/monthly groups `scripts/vm/nightly.sh` will run. The candidate list, ranking
and cadence reasoning are in the inventory (`periodic-refresh-inventory.md`, session scratchpad); this file
is what each command is *now*.

Timings marked **measured** were taken on 2026-09-29, first from the desktop (residential IP) against a scratch
copy of the tables, then on the EC2 nightly VM (**VM**, rehearsal below). Everything else is from the 21 Sep 2026
receipts or the `docs/DATA-*.md` files and is marked **est.** The wiring is `scripts/weekly_refresh.sh` (weekly and
monthly groups, run by `scripts/vm/nightly.sh` on Sundays / the first Sunday) plus the daily additions in
`scripts/daily_refresh.sh`; `docs/operations/nightly-refresh.md` says how they fit into the night.

## 1. Setup every step assumes

```bash
REPO=~/opax; PY="$REPO/.venv/bin/python"
DB="$HOME/.cache/autoresearch/parli.db"
export OPAX_DB="$DB" PYTHONPATH="$REPO"        # loaders and exporters read OPAX_DB; nothing ssh-es to the desktop
cd "$REPO"; [ -f .env ] && { set -a; . ./.env; set +a; }
STAGE="$PIPE/stage"; TMP="$PIPE/tmp"; rm -rf "$STAGE"; mkdir -p "$STAGE" "$TMP"
```

`OPAX_DB` is honoured by every exporter, by `ext_common` (all `add_writer_args` loaders, `money_classify`),
`export_grants.py`, `votes_state.py`, `ext_apply.py` and the other loaders with a `--db` default. With it
unset behaviour is exactly as before (the desktop `ssh` backend for the ext loaders). Per-loader
`--db PATH` still wins; `--db-local` / `--local` means "the database on this machine" (`OPAX_DB`, else
`~/.cache/autoresearch/parli.db`).

### Exit codes

| Command | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| `ext_apply.py` | every requested source applied or already identical | (unused) | usage or schema drift; nothing applied | at least one source **refused** (empty / under ratio) or **missing** from the stage; the others were applied unless `--strict` |
| `refresh_releases.py` | every step ran and succeeded | a fetch or publish step failed, or the KB "no generation" check failed (others still ran; nothing created after a failed check) | | |
| `money_state_donations`, `money_small_jurisdictions`, `money_lobbyists` (direct) | ok | an exception (a lobbyist jurisdiction that fails is logged `FAILED` and skipped, exit stays 0) | | a source's replace was refused by the empty-upstream guard; the other sources still loaded |
| `state_rosters fetch`, `qld_contracts` | ok | exception | | refused: the stored rows were kept (`--allow-shrink` overrides) |
| `money_ipea` | ok (a quarter outside `--since`/`--until` whose licence changed is only a `WARNING` line) | exception | | a quarter in range whose data.gov.au licence (`license_id`, licence URL) is no longer `money_ipea.LICENCE` was not loaded and keeps its stored rows; the other quarters loaded. A re-spelled licence title is only noted |
| `keep_if_unchanged.py` | `unchanged` or `changed` printed | | new file missing / empty / unparseable (committed file untouched) | repo unreadable or path outside it |
| `validate_data.py GROUP...` | all groups ok | number of failing groups (one `FAIL <group>: ...` line each) | | |

An unattended step treats **3 as "stale, not broken"**: the register on disk is the last good one. Do not
retry with `--allow-shrink` in a cron job; that is a human re-baseline (see §6).

### The building blocks

- **`scripts/ext_apply.py <profile> --stage FILE|--stage-dir DIR --db "$DB"`** reconciles a *staged* load
  into the live tables: refuses an empty stage or one under `--min-ratio` (0.9; `--source-ratio SRC=0.7`
  per source), keeps the id of every unchanged row and any reviewed `industry` label, updates amended rows
  in place (register id / GUID / `ga_id` identity), archives superseded rows to
  `~/.cache/opax/archive/<source>/<date>.json` (sha256 in the report and in `ext_ingest_log`), applies in one
  `BEGIN IMMEDIATE` transaction and checks stored == staged before it commits. Profiles: `donations`
  (`qld_ecq vic_vec tas_tec`), `lobbyists` (six registers, four tables move together), `fits` (four tables),
  `grants` (windowed: `--since YYYY-MM-DD`). `--dry-run` writes nothing (no archive, no log); `--strict` applies
  nothing if any source is refused or missing; `--source S` restricts. It prints a JSON report.
  Each staged loader writes into an empty scratch file, so the loader-level guard cannot trip there; the
  guard that matters is `ext_apply`'s.
- **Empty-upstream guard in the loaders themselves** (for anything still loaded straight into the live DB):
  `ExtWriter.replace` refuses an empty fetch or one under 50% of the rows its DELETE would remove
  (`ExtGuardError`; `--allow-shrink` or `OPAX_ALLOW_SHRINK=1` overrides).
- **`scripts/vm/keep_if_unchanged.py <committed-path> <new-file>`** keeps the committed file byte-identical
  when the re-export differs only by `generated*` / `*_at` stamps (`as_at` is data). After a directory export:
  `keep_if_unchanged.py --sweep <dir>...` restores every tracked `.json` under those paths whose change is
  stamp-only. `--ignore-key REGEX` adds patterns.
- **`scripts/vm/validate_data.py GROUP...`** groups added here: `money grants suppliers access expenses
  interests fits speakers people pay discovery` (existing: `bills votes corpus wrangler`). A failing group is
  reverted by the caller: `git checkout HEAD -- <its paths>` plus `git clean -fdq -- <its directories>`.
- **`scripts/refresh_releases.py`** (below).

## 2. Loaders (into `parli.db`)

Runtimes: **measured** unless marked. "Stage" = load into `$STAGE/<file>.sqlite`, then `ext_apply`.

| Source | Cadence | Commands | Runtime | Hosts contacted |
|---|---|---|---|---|
| **Govt releases** PM / QLD / VIC / Treasury → `ext_press_releases`, KB `press_release` | nightly | `$PY scripts/refresh_releases.py --db "$DB" --since "$SINCE"` (audit only), add `--apply` under `OPAX_SYNC_KB=1` | fetch PM 102 s (450 ids), QLD 293 s (350 ids), Treasury 3 s; VIC **est.** ~15 min (robots crawl-delay 2, 21 Sep: 923 s); audit publish ~1 s per source | `pmtranscripts.pmc.gov.au`, `statements.qld.gov.au`, `www.premier.vic.gov.au`, `ministers.treasury.gov.au`; `--apply` also the KB (ARAG_* in `.env`) |
| **GrantConnect awards** → `ext_grants`, KB `grant_award` | nightly (or weekly) | `S=$(date -d '-45 days' +%F)`; `$PY -m parli.ingest.grantconnect --since $S --refetch --db "$STAGE/grants.sqlite"`; `$PY scripts/ext_apply.py grants --stage "$STAGE/grants.sqlite" --db "$DB" --since $S` | fetch 8.8 s (3,027 awards, 2 windows); apply < 1 s | `www.grants.gov.au` (needs the browser-like UA the loader already sends; openpyxl) |
| **State donations** QLD / VIC / TAS → `ext_donations` | weekly | `$PY -m parli.ingest.money_state_donations --source qld --db "$STAGE/qld.sqlite"`; same with `--source vic --db "$STAGE/vic.sqlite"`; `$PY -m parli.ingest.money_small_jurisdictions --source tas --db "$STAGE/tas.sqlite"`; `$PY scripts/ext_apply.py donations --stage-dir "$STAGE" --db "$DB"`; `$PY -m parli.ingest.money_classify --db "$DB"` | QLD fetch 9 s, VIC **est.** 48 s (21 Sep), TAS not measured; apply 0.4 s; classify 1.2 s (scratch copy) | `disclosures.ecq.qld.gov.au`, `disclosures.vec.vic.gov.au`, `disclosures.tec.tas.gov.au`, `www.tec.tas.gov.au` |
| **Lobbyist registers** ×6 → `ext_lobbyists`, `_clients`, `_people`, `_contacts` | weekly | `$PY -m parli.ingest.money_lobbyists --db "$STAGE/lobbyists.sqlite"`; `$PY scripts/ext_apply.py lobbyists --stage "$STAGE/lobbyists.sqlite" --db "$DB"` | federal alone 3 min 52 s (700 firms); all six **est.** ~25 min (`docs/DATA-MONEY.md`); apply 0.1 s | `api.lobbyists.ag.gov.au`, `lobbyists.ag.gov.au`, `lobbyists.elections.nsw.gov.au`, `lobbyists.integrity.qld.gov.au`, `www.lobbyists.vic.gov.au`, `www.lobbyists.sa.gov.au` + `saglobbyistapi02prdaue.azurewebsites.net`, `www.lobbyists.wa.gov.au` |
| **FITS** → `ext_fits_*` | weekly | `$PY -m parli.ingest.fits_register --db "$STAGE/fits.sqlite"`; `$PY scripts/ext_apply.py fits --stage "$STAGE/fits.sqlite" --db "$DB"` | fetch 24 s (15 requests); apply 0.1 s | `foreigninfluence.ag.gov.au` |
| **FRL Acts** → `ext_frl_acts` (bills "became law") | weekly | `$PY -m parli.ingest.words_parlinfo --db "$DB" frl-acts` (INSERT OR REPLACE on `act_id`, never deletes) | **est.** ~5 min (276 requests) | `api.prod.legislation.gov.au` |
| **AusTender full feed** → `ext_contracts` | nightly | `$PY -m parli.ingest.austender_full --db "$DB" --since "$(date -d '-10 days' +%F)"` (never deletes; last 3 days always refetched) | **est.** seconds per day | `api.tenders.gov.au` |
| **Contract suppliers** → `ext_contract_suppliers` | weekly | `$PY -m parli.ingest.contract_suppliers --db "$DB" --abr-dir "$HOME/.cache/autoresearch/abr"` | not measured on VM | none (local ABR index) |
| **Diaries** NSW → `ext_ministerial_meetings` | weekly | `$PY -m parli.ingest.money_diaries --jurisdiction nsw --years "$(date +%Y)" --new-only --db "$DB"` | **est.** ~1 min with the PDF cache warm and `--new-only` | `www.nsw.gov.au` |
| **Diaries** QLD | monthly | `$PY -m parli.ingest.money_diaries --jurisdiction qld --db "$DB"` | **est.** 1,040 s warm (612 PDFs), ~25 min cold | `cabinet.qld.gov.au` |
| **IPEA expenses** → `ext_expenses` | monthly (due mid Feb/May/Aug/Nov) | `$PY -m parli.ingest.money_ipea --since "$(date +%Y)q01" --db "$DB"` (links `person_id` because the target has `members`; an empty quarter is skipped) | **est.** 2 s (cached CSV) | `data.gov.au` (CKAN and the resource download) |
| **Interests, federal** → `ext_interests` | daily (`daily_refresh.sh`) | `$PY -m parli.ingest.conduct_interests_federal refresh --db "$DB"` (shared 100-credit maximum; environment key) | cold base 78 credits before retries, PDFs direct; warm two indexes + changed/unavailable Senate pages | `www.aph.gov.au` via Firecrawl, `interests-register-api-public.aph.gov.au`, `static.aph.gov.au` |
| **Interests, QLD** → `ext_interests` | weekly | `$PY -m parli.ingest.conduct_interests_qld --fetch --db "$DB"` (`--db` is required to write) | **est.** seconds (one PDF) | `documents.parliament.qld.gov.au` |
| **QLD contracts** → `ext_state_contracts` | monthly | `$PY -m parli.ingest.qld_contracts --db "$DB"` (refuses to replace with an empty or under-half load; exit 3) | **est.** ~15 min | `www.data.qld.gov.au` and the resource hosts it lists |
| **State rosters** → `ext_state_roster` | monthly | `$PY -m parli.ingest.state_rosters fetch --db "$DB" && $PY -m parli.ingest.state_rosters resolve --db "$DB"` (`fetch` keeps a position whose fetch is empty/under half, exit 3) | **est.** 109 s | `query.wikidata.org` |
| **Grant recipients** → `ext_grant_recipients` (+ `_keys`) | monthly | `$PY -m parli.ingest.grant_recipients --db "$DB" --abr-dir "$HOME/.cache/autoresearch/abr"` | **est.** ~1 min on the desktop | none (local ABR index) |

Never automated (see the inventory): federal AEC returns (`donations.py` clears the table), WA/ACT/NT donations
(research-only), committee witnesses (event driven), bill text.

### `refresh_releases.py` in detail

```
$PY scripts/refresh_releases.py --db "$DB" --since "$SINCE"          # fetch + audit, no KB access
$PY scripts/refresh_releases.py --db "$DB" --since "$SINCE" --apply  # fetch + create in the KB
    [--source pmtranscripts|qld|vic|treasury ...] [--no-fetch] [--no-publish] [--plan]
```

`--since` defaults to 14 days ago. PM and QLD are id probes: the window is derived from the highest stored
`source_id` (PM `max-50 .. max+400`, QLD `max-50 .. max+300`), VIC reads 16 sitemap pages / 400 slugs, Treasury
follows `links.next` for 300 rows. Publishing is `words_sync --full --limit 10000` (idempotent: a 409 from the
KB means "already there"). With `--apply` the KB is first checked to have no automatic generation (summary
provider `none`, enrichment tasks disabled); if that check fails nothing is created and the exit is 1.
It prints one JSON report (per source: rows before/after, newest date, created/existing/failed, rejections).
VIC and QLD probes may fail from a datacenter IP: allow the step to fail until probed. NSW releases keep their
own step in `daily_refresh.sh`.

## 3. Exports (into `portal/public/`)

Run **after** the loaders of their group, in this order (later ones read earlier outputs). Each writes to
`$TMP` (or in place for directory exports), then `keep_if_unchanged` (or `--sweep`) removes stamp-only churn,
then the `validate_data.py` group runs; a failing group is reverted as in §1.

| # | Export | Command | Committed path(s) | Guard group | Reads | Cadence | Runtime |
|---|---|---|---|---|---|---|---|
| 1 | speakers | `$PY scripts/export_speakers.py > $TMP/speakers.json` | `speakers.json` | `speakers` | `speeches` (full scan) | weekly | est. ~3.5 min |
| 2 | people | `$PY scripts/export_parliamentarians.py > $TMP/p.json` | `parliamentarians.json` | `people` | `speeches`, `members` | weekly | est. ~3.5 min |
| 3 | money map | `$PY scripts/export_money_graph.py > $TMP/money.json` | `graph/money.json` | `money` | `donations`, `ext_donations`, `ext_donor_entities` | weekly (monthly before suppliers) | not measured |
| 4 | state money | `for j in qld vic tas; do $PY scripts/export_state_money.py $j > $TMP/money.$j.json; done` | `graph/money.qld.json`, `money.vic.json`, `money.tas.json` | `money` | `ext_donations` | weekly | not measured (`wa act nt` need `--gated` and must never be written under `portal/public/`) |
| 5 | access | `$PY scripts/export_access.py portal/public/graph/money.json portal/public/speakers.json > $TMP/access.json` | `access.json` | `access` | `ext_ministerial_meetings`, `ext_lobbyist_clients`; needs #1, #3 | weekly | not measured |
| 6 | fits | `$PY scripts/export_fits.py --portal portal/public --out $TMP/fits.json` | `fits.json` | `fits` | `ext_fits_*`; needs #2, #3, #4, #5 | weekly | measured: ran in seconds on the scratch copy |
| 7 | interests | `$PY scripts/export_interests.py --out portal/public/interests` | `interests/` (320 files; `git clean` for removed people) | `interests` | `ext_interests`; needs #3, #5, #6 | daily + after weekly QLD/tie updates | not measured |
| 8 | expenses | `$PY scripts/export_expenses.py > $TMP/expenses.json` | `expenses.json` | `expenses` | `ext_expenses` | monthly (after a new IPEA quarter) | est. seconds |
| 9 | suppliers + agencies | `$PY scripts/export_suppliers.py --db "$DB" --published-since 2025-07-08 --output portal/public` | `suppliers.json`, `suppliers/`, `agencies.json`, `agencies/` | `suppliers` | `ext_contracts*`, `ext_contract_suppliers`; needs fresh #3 | monthly | not measured |
| 10 | grants (federal) | `$PY scripts/export_grants.py federal --local` | `graph/grants.federal.json`, `grants/federal/` (**not** `grants/program-notes.json`, **not** `grants/qld/`) | `grants` | `ext_grants`, `ext_grant_recipients*`, `parliamentarians.json` | monthly | not measured |
| 11 | discovery | `$PY scripts/export_discovery.py --db "$DB" --output $TMP/discovery.json` | `discovery.json` | `discovery` | `donations`, legacy `contracts` | monthly | not measured |
| 12 | pay | `$PY scripts/build_pay.py --refresh --out $TMP/pay.json` (no DB) | `pay.json` | `pay` | Handbook API | monthly | est. ~200 requests |

Install with `python scripts/vm/keep_if_unchanged.py portal/public/<file> $TMP/<file>` per single file (exit 0
prints `unchanged` or `changed`); directory exports (#7, #9, #10) write in place, so follow with
`keep_if_unchanged.py --sweep portal/public/interests` (etc.). Then
`python3 scripts/vm/validate_data.py <group>...`.

CI coupling (inventory finding 7): `portal/test/program-notes.test.mjs` needs every hand-noted federal
program id in `grants.federal.json` `programs[]`; the `grants` group enforces the same rule so a re-rank that
drops one is reverted, not deployed red. Other tests read `graph/money.json`, `money.qld.json`, `suppliers.json`,
`pay.json`, `parliamentarians.json`; a data-only commit can still fail the deploy job's `node --test`.

## 4. Hosts in `scripts/vm/probe_sources.py`

All are in the probe now (30 probes, same host, path shape and User-Agent as each loader). **VM, 2026-09-29, from the
AWS address: every one answers** (PM transcripts, QLD statements, VIC Premier, Treasury, AusTender full-feed UA,
GrantConnect, legislation.gov.au, ECQ, VEC, TEC, federal/NSW/QLD/VIC/WA lobbyists, the SA lobbyist API, FITS, QLD
members register PDF, NSW and QLD diaries, ACNC/ATO on data.gov.au, QLD open data, Wikidata, the Handbook API,
GitHub raw) except the SA lobbyist *site*, which Cloudflare blocks (its API works and is what the loader reads).
Sources marked (WAF?) were the likeliest to refuse a datacenter IP.

```
pmtranscripts.pmc.gov.au        statements.qld.gov.au        www.premier.vic.gov.au       ministers.treasury.gov.au
www.grants.gov.au (WAF?)        api.tenders.gov.au           api.prod.legislation.gov.au  query.wikidata.org
disclosures.ecq.qld.gov.au (WAF?)  disclosures.vec.vic.gov.au  disclosures.tec.tas.gov.au   www.tec.tas.gov.au
api.lobbyists.ag.gov.au         lobbyists.ag.gov.au          foreigninfluence.ag.gov.au
lobbyists.elections.nsw.gov.au (WAF?)  lobbyists.integrity.qld.gov.au  www.lobbyists.vic.gov.au
www.lobbyists.sa.gov.au (known WAF)  saglobbyistapi02prdaue.azurewebsites.net  www.lobbyists.wa.gov.au
www.nsw.gov.au (diary PDFs)     cabinet.qld.gov.au           data.gov.au                  documents.parliament.qld.gov.au
www.data.qld.gov.au             handbookapi.aph.gov.au       raw.githubusercontent.com (pay: OpenAustralia people.csv)
```

The KB endpoint from `ARAG_*` is contacted only under `--apply`.

## 5. VM prerequisites

- **Python venv** (`.venv`): `requests`, `beautifulsoup4` + **`lxml`**, `openpyxl` (GrantConnect XLSX, QLD contracts),
  `pdfplumber` (diaries), `pdfminer.six`. `lxml` was **not** in `pyproject.toml`/`uv.lock` (the desktop had it by accident):
  the VM rehearsal failed the VIC and TAS donation loaders on `bs4.FeatureNotFound: ... lxml`, and it is now declared.
  An existing VM venv needs `uv sync --frozen` (bootstrap does it) or `uv pip install lxml==6.1.3`.
- **git** (for `keep_if_unchanged` and `validate_data`). **No Node needed by these commands**; the nightly's pre-commit
  test gate uses Node 24 + `portal/node_modules`, which `scripts/vm/bootstrap.sh` installs.
  The `sqlite3` CLI is not needed by these commands (`refresh_releases` reads with Python).
- **`.env`** with the ARAG_* values, for `refresh_releases.py --apply` only.
- **Inputs to transfer once**: `scripts/vm/transfer_state.sh --only periodic` (run on the desktop; safe on a VM that
  already ran a nightly) sends `~/.cache/autoresearch/abr/abr_names.sqlite` (3.3 GB; `contract_suppliers`,
  `grant_recipients`, `donor_entities`), `ext_money/` (diary PDFs 110 MB: avoids ~65 min of cold downloads; lobbyist,
  donation, IPEA and GrantConnect caches), `qld_contracts/` (394 MB; 926 cached files), `federal_lobbyists/`, `fits/`,
  `votes_state/`, `mp_interests/`, `ministerial_diaries/`, `donations/`, `conduct_interests/`. Everything except the
  ABR index is only a cache (a missing file is re-downloaded). Stage files measured: FITS 4 MB, QLD donations 9 MB,
  federal lobbyists 1.5 MB, a 45-day GrantConnect window under 1 MB.
- **Disk:** `~/.cache/opax/archive` grows by the superseded rows of each applied source (FITS was 1.1 MB for a
  month of movement); `$PIPE/stage` is recreated each run.
- **Time (measured on the VM, 2026-09-29, first full run):** weekly ~40 min (loaders 30: lobbyists 22 min, `frl_acts` 3 min,
  `contract_suppliers` 7 min, ACNC/ATO 53 s for a first full load; exports 8 min, two of them a `speeches` scan of ~3 min);
  monthly ~40 min more (`qld_contracts` 7 min, `diaries_qld` 10-13 min, IPEA 2 min, `speaker_hygiene` 11 min, `grant_recipients`
  4 min, exports 5 min). See "How long it takes" in nightly-refresh.md.

## 6. When a step exits 3, and re-baselining

- Read the `ext_apply` JSON (`status`, `reason` per source). `refused` means the stage was empty or under the
  ratio (a dead portal, a scraper whose selectors broke, a run that lost pages): the live rows are untouched,
  nothing was archived, and tomorrow's run tries again. `missing` means the loader produced no rows for an
  expected source and none are stored.
- A **legitimate** shrink (a register was really cleaned up): a person re-runs
  `ext_apply.py <profile> --source S --source-ratio S=0.5` (or `--min-ratio`), reads the archive under
  `~/.cache/opax/archive/S/`, and only then lets the weekly job continue. For a direct loader
  `--allow-shrink` / `OPAX_ALLOW_SHRINK=1`.
- Undo an applied source: the archive holds every deleted row and the pre-image of every amended row (same
  `rowid`), with the sha256 also written to `ext_ingest_log.notes`.
- Reviewed `industry` labels live in `ext_donations.industry` / `industry_source`; `ext_apply` never overwrites
  them on an unchanged or amended row and carries them to new rows only when every earlier row of that donor
  agrees on one label. Run `money_classify` after `donations` to label the rest.

## 7. Proven, and not

The VM rehearsal (2026-09-29) ran both groups end to end against the real database with pushes off: every loader and export
ran (donations, lobbyists, FITS, QLD interests, NSW/QLD diaries, ABN-linked suppliers and grant recipients, ACNC/ATO, FRL
Acts, QLD contracts, IPEA, rosters, speaker hygiene; sixteen exports), the nightly validated eleven groups, the portal
gate ran green and a commit was pushed to a local bare origin. It found: `lxml` missing from the lock (fixed); the bare
`export_parliamentarians.py` losing `representation` (fixed by `scripts/vm/export_people.sh`); and that the ACNC/ATO tables
had never been loaded into the VM's copy of the database (the first `--check-updated` did the full load). Not exercised on
the VM: the `--apply` paths that write to the knowledge box for releases, division documents and GrantConnect awards
(`refresh_releases --apply`, `votes_ingest`, `publish_recent_grants`); they are create-only and run for the first time in the
first real nightly after this lands.
