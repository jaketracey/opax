# Periodic refresh: the sources the nightly does not touch

Runbook for refreshing the one-off data sources (government releases, GrantConnect, state donations,
lobbyist registers, FITS, IPEA, diaries, interests, rosters, contracts, FRL Acts) and the static JSON
exports built from them, **unattended on the nightly VM**. It is the contract between the prerequisites
in this change and the weekly/monthly groups `scripts/vm/nightly.sh` will run. The candidate list, ranking
and cadence reasoning are in the inventory (`periodic-refresh-inventory.md`, session scratchpad); this file
is what each command is *now*.

Timings marked **measured** were taken on 2026-09-29 from the desktop (residential IP) against a scratch
copy of the tables, never the live database. Everything else is from the 21 Sep 2026 receipts or the
`docs/DATA-*.md` files and is marked **est.** Nothing here has been run on the VM: measure there first.

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
| **Interests, QLD** → `ext_interests` | weekly | `$PY -m parli.ingest.conduct_interests_qld --fetch --db "$DB"` (`--db` is required to write) | **est.** seconds (one PDF) | `documents.parliament.qld.gov.au` |
| **QLD contracts** → `ext_state_contracts` | monthly | `$PY -m parli.ingest.qld_contracts --db "$DB"` (refuses to replace with an empty or under-half load; exit 3) | **est.** ~15 min | `www.data.qld.gov.au` and the resource hosts it lists |
| **State rosters** → `ext_state_roster` | monthly | `$PY -m parli.ingest.state_rosters fetch --db "$DB" && $PY -m parli.ingest.state_rosters resolve --db "$DB"` (`fetch` keeps a position whose fetch is empty/under half, exit 3) | **est.** 109 s | `query.wikidata.org` |
| **Grant recipients** → `ext_grant_recipients` (+ `_keys`) | monthly | `$PY -m parli.ingest.grant_recipients --db "$DB" --abr-dir "$HOME/.cache/autoresearch/abr"` | **est.** ~1 min on the desktop | none (local ABR index) |

Never automated (see the inventory): federal AEC returns (`donations.py` clears the table), WA/ACT/NT donations
(research-only), House/Senate interests (WAF / Firecrawl), committee witnesses (event driven), bill text.

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
| 7 | interests | `$PY scripts/export_interests.py --out portal/public/interests` | `interests/` (320 files; `git clean` for removed people) | `interests` | `ext_interests`; needs #3, #5, #6 | weekly | not measured |
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

## 4. Hosts to add to `scripts/vm/probe_sources.py`

All should answer from the AWS address before the groups are enabled. Sources marked (WAF?) are the likeliest
to refuse a datacenter IP.

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

- **Python venv** (`.venv`): `requests`, `beautifulsoup4` + `lxml`, `openpyxl` (GrantConnect XLSX, QLD contracts),
  `pdfplumber` (diaries), `pdfminer.six`. All are already in `pyproject.toml`; nothing new was added.
- **git** (for `keep_if_unchanged` and `validate_data`). **No Node needed** for anything in this file.
  The `sqlite3` CLI is not needed by these commands (`refresh_releases` reads with Python).
- **`.env`** with the ARAG_* values, for `refresh_releases.py --apply` only.
- **Inputs to transfer once** (`scripts/vm/transfer_state.sh` copies none of these today):
  `~/.cache/autoresearch/abr/abr_names.sqlite` (3.3 GB; `contract_suppliers`, `grant_recipients`, `donor_entities`);
  `~/.cache/autoresearch/ext_money/diaries` (110 MB; avoids ~65 min of cold PDF downloads);
  `~/.cache/autoresearch/qld_contracts/` (394 MB; 926 cached files); optionally `ext_money/grantconnect` and
  `ext_money/state_donations` (small; they are re-downloadable). Stage files measured: FITS 4 MB, QLD donations
  9 MB, federal lobbyists 1.5 MB, a 45-day GrantConnect window under 1 MB.
- **Disk:** `~/.cache/opax/archive` grows by the superseded rows of each applied source (FITS was 1.1 MB for a
  month of movement); `$PIPE/stage` is recreated each run.
- **Time:** the weekly group's loaders add about 30-40 min (est.); the exports are unmeasured on the VM (each
  `speeches` scan is ~3.5 min on gp3). Measure once with
  `OPAX_NIGHTLY_NO_PUSH=1 scripts/vm/nightly.sh` on a maintenance boot once the weekly and monthly groups are
  wired in (forcing a group on a given night is the pipeline agent's to define).

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

## 7. Not proven

The dry run (2026-09-29) exercised FITS, the federal lobbyist register, QLD donations and a 45-day GrantConnect
window through fetch → truncated stage refused → dry-run → apply → idempotent re-run, and PM/QLD/Treasury
releases through fetch + audit publish. Covered by unit tests only, not by a real upstream: the roster and
QLD-contracts guards, the IPEA link and empty-quarter skip, `--new-only` diaries against real PDFs, TAS, VIC
donations, the other five lobbyist registers, and `refresh_releases --apply` (only the KB safety check was run,
read-only). No export was timed on the VM.
