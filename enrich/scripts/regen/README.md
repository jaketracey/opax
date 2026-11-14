# 5b-cheap brief regeneration

A one-off, bounded rerun of selected Workers AI briefs with `@cf/qwen/qwen3.8-27b` (thinking off).
The 5b audit found Workers AI briefs had a 6.4% serious-error rate, clustered in two places:
- 1998-2000 zenodo turns;
- committee witness turns written up as askers.

## Slices

The slices are defined in code (`slices.ts`). The rid files only propose rows. A row outside its slice's
filter is skipped, and noted, before anything is spent.

| Order | Slice | Variant | Filter (checked against the live KB record and the snapshot) |
| --- | --- | --- | --- |
| 1 | `zenodo` | b | `source/zenodo`, and the title's sitting date is in 1998-2000 |
| 2 | `witness` | role (or b) | `speaker_type/witness`, and the old brief matches the costing regex (asker verb, opens "Moved", or the committee speaking) |
| 3 | `gptoss` | b | the old brief came from `@cf/openai/gpt-oss-*` (only if the cap leaves room) |

**Every slice:**
- `kind/speech`;
- not `source/hansard_hist`;
- at least 80 words (shorter turns are hidden by the portal's short-turn rule).

**Order:**
- Each slice owns a band of `seq`, set by `seed` from the slice name (there is no `--seq-base`).
- The runner takes rows from the earliest slice that still has pending rows, so a batch never mixes
  slices and witness rows never run while zenodo rows are pending.

## How a brief gets written

The runner never writes the knowledge box. For each row it does these steps:

1. **Snapshot first** (`seed`). It copies the queue row's current brief, model and `force` into
   `regen_5b_cheap` before anything is generated. A re-seed never replaces a snapshot.
2. **Checks.** Nothing is spent unless all three pass:
   - the queue row still matches the snapshot;
   - the live KB brief still matches the snapshot;
   - the row is inside its slice's filter.
3. **Generation.** It generates with the Worker's own `generate()`: the same prompts, schema,
   validators, retry and gpt-oss escalation.
   - qwen3.8 runs at `max_tokens` 256 with thinking off: `chat_template_kwargs: {enable_thinking: false}`.
     A top-level `enable_thinking` is ignored by Workers AI. The model then reasons until it hits
     `max_tokens`, and every reply is cut off (seen in the first pilot minute, 14 Nov).
   - gpt-oss keeps 4000.
   - For witness rows, variant `role` adds `speaker_role` to the record, plus one prompt line and
     validator check: never open "Asked" or "Moved".
4. **Hand-off.** It sets the queue row to `status 'done', outcome 'unwritten', force 1,
   model <actual model>, result <new brief>`, but only if the row still holds the snapshotted brief.
   The Worker's live tick then delivers it like any other stored result: `flush` calls
   `writeItem(force)` and the row returns to `outcome 'written'`.
5. **After the write** (`verify`, which the run also does every 10 minutes):
   - the queue row's `force` goes back to its snapshot value;
   - the row becomes `written`.

The prompt version (`5b-cheap-1`) and the variant are recorded in `regen_5b_cheap`.

## Guard (`guard.ts`)

**Flags fail closed** (`args.ts`). Flags are space-separated (`--limit 50`). The command refuses all of
these, and runs nothing:
- `--flag=value`;
- an unknown flag;
- a stray word;
- a repeated flag;
- a missing or malformed value.

The values are checked too:
- `run` requires `--cap-usd`: a plain number above 0 and at most 30.
- `--limit` and `--concurrency` are positive whole numbers; concurrency is at most 4.

**Metering**
- Every call writes a reservation (its upper bound, the Worker's `callUpper`) to an fsynced JSONL
  ledger before it goes out. Afterwards it writes a settlement with the actual neurons, taken from
  the response's `usage` at the published rates.
- Missing usage is booked at the upper bound.
- A reservation with no settlement (a crash mid-call) counts at its upper bound.
- Each settlement is also booked into the Worker's D1 `spend` table as `regen:<model>`. The Worker's own
  daily guard sums that table, so it sees our spend. The runner's read of the Worker's spend leaves out
  `regen:` rows.
- If that D1 write fails, the run stops. The brief already paid for is kept and handed off.

**Caps:** checked before every request. Any input that is not a finite number refuses the call.
- **Run cap:** the run stops at `--cap-usd`, at most US$30 actual. The check is "spent + this call's upper
  bound ≤ cap"; anything else (including NaN) refuses.
- **Daily share:** "ours today + upper ≤ 1,500,000 − max(Worker spend so far today, Worker
  headroom)", where the headroom is 1.2 × the Worker's peak day over the last 30 days (its D1 `spend`
  table, without `regen:` rows).
- When the share is used up, the run pauses to the next UTC day (`--wait`) or exits.
- The Senate and NSW backfills are not paused.
- **No backfill, no admits.** The Worker's budget is 1.5M only while low-priority backfill rows remain
  (its own `hasBackfill()`). Otherwise it is `STEADY_NEURON_BUDGET` (150k), and its guard sums every
  `spend` row, ours included.
  - So the runner admits nothing while the Worker has no backfill. Without this, our spend would use up the
    150k and stop live enrichment, and the flush of our own briefs (`tick.ts` `mayContinue`).
  - With `--wait`, it checks again every 10 minutes; without, it exits `paused`.
  - The check is cached for a minute.
  - `headroom` shows whether backfill rows exist now.

**Order of checks for each request:**
1. stop, pause and the STOP file;
2. the Worker's spend (a D1 read);
3. stop, pause and the STOP file again;
4. the ledger re-read from disk;
5. the caps;
6. the reservation.

Inside `post()`, a gate runs again after the OAuth token wait and immediately before `fetch`. A stop or
STOP file set during either wait sends nothing.

**Stops:**
- any 402, 403 or 429;
- any other status ≥ 400. The one exception is a 400, 413 or 422 whose errors all carry an allowlisted
  per-item code (5006, input failed the model's schema). That skips the row only.
  - Code-only errors such as 4006, 3036 or 10000 stop the run, as do unknown codes or no code.
  - 3 per-item skips in a row stop the run.
- billing, quota or limit wording anywhere outside the model's own text, including in a 200 body;
- a network error (booked at the upper bound, in the ledger and in D1);
- `success: false`;
- a model with no published price;
- the `STOP` file, checked before every request and again just before it is sent.

**One runner at a time:**
- Every command except `status` and `headroom` takes `LOCK` in the state directory: an exclusive create
  holding the PID, removed on exit.
- If the lock exists, the command refuses and names the holder. A lock is never taken over automatically:
  if its process is gone (`/bin/ps -p <pid>`), remove the file by hand.
- The ledger is also re-read before each admission, so even two processes could not pass the cap twice.
- While a run holds the lock, `verify` is refused. The run does the same work itself every 10 minutes;
  `status` stays available.

**Resume:** no brief is paid for twice.
- Each generated brief is fsynced to `results.jsonl` before D1 is updated.
- At start-up, a row left `generating` reuses its stored result. A result generated in compare mode
  stays held, even if its second variant failed.
- With no stored result, the row becomes `interrupted` and is never retried automatically.
- A request that got no answer (a network error) may have been billed. Its row also becomes
  `interrupted`.
- Workers AI uses wrangler's OAuth login, which wrangler refreshes only once it has expired. Within
  2 minutes of expiry the runner waits it out, then refreshes through `wrangler whoami`. If the token
  still can't be read, the run stops.

## Commands

State lives in `~/.cache/opax/regen-5b-cheap/`: `ledger.jsonl`, `results.jsonl`, `run.log`,
`account`, `LOCK` and `STOP`.

**Tokens**
- D1 uses `~/.cache/opax/cf-deploy.token`.
- The KB uses `~/.cache/opax/kb.env`. It is read only.
- Workers AI uses wrangler's existing OAuth login, refreshed through `wrangler whoami` once it has
  expired. Set `WRANGLER_BIN` if `enrich/node_modules` is absent.

```sh
R=~/.cache/opax/regen-5b-cheap
node scripts/regen/cli.ts help                     # every command and its flags
node scripts/regen/cli.ts headroom                 # read-only: the Worker's peak day and our daily share
node scripts/regen/cli.ts init                     # create regen_5b_cheap (IF NOT EXISTS)
node scripts/regen/cli.ts status --run 5b-cheap-1  # the daily progress line (read-only)
node scripts/regen/cli.ts verify --run 5b-cheap-1  # force back, queued -> written, once the Worker has written
touch $R/STOP                                      # halt before the next request
```

## Run plan

**1. Pilot** (after review approval only). It uses 10 zenodo and 20 witness rows: about 50 generations,
because each witness row gets both variants.

`--compare` holds EVERY row, plain-variant zenodo rows included. Nothing is queued and nothing reaches
production until `release`. The cap is US$0.05 and runs in one process.

```sh
node scripts/regen/cli.ts seed --run 5b-cheap-1 --slice zenodo --rids $R/pilot-zenodo.json
node scripts/regen/cli.ts seed --run 5b-cheap-1 --slice witness --rids $R/pilot-witness.json   # variant role; b is generated alongside
node scripts/regen/cli.ts run --run 5b-cheap-1 --limit 50 --cap-usd 0.05 --concurrency 1 --compare
```

Then judge the held rows: role against b for witness rows, with the 5b judge and anchors.

```sh
node scripts/regen/cli.ts release --run 5b-cheap-1 --variant role --dry-run    # or --variant b if role is not better
node scripts/regen/cli.ts release --run 5b-cheap-1 --variant role
node scripts/regen/cli.ts release --run 5b-cheap-1 --variant role --rids <rid>,<rid>   # only rows that passed; the rest stay held
```

`release` queues the chosen variant of each witness row. A zenodo row has one variant (b) and is queued
as it is.

**2. Rollback rehearsal.** A dry run on 3 rows; it writes nothing.

```sh
node scripts/regen/cli.ts rollback --run 5b-cheap-1 --all --limit 3 --dry-run
```

**3. Full run**, pausing at each day's share. If the pilot shows role is not better, seed witness with
`--variant b`.

```sh
node scripts/regen/cli.ts seed --run 5b-cheap-1 --slice zenodo --rids $R/zenodo.json
node scripts/regen/cli.ts seed --run 5b-cheap-1 --slice witness --rids $R/witness.json
node scripts/regen/cli.ts seed --run 5b-cheap-1 --slice gptoss --rids $R/gptoss.json
node scripts/regen/cli.ts run --run 5b-cheap-1 --cap-usd 30 --wait
```

## Rollback (one command)

```sh
node scripts/regen/cli.ts rollback --run 5b-cheap-1 --all [--limit N] [--dry-run]
node scripts/regen/cli.ts rollback --run 5b-cheap-1 --slice witness
node scripts/regen/cli.ts rollback --run 5b-cheap-1 --rids <rid>,<rid>
```

- Rollback hands each old brief back the same way: a forced `unwritten` queue row, which the Worker's
  next tick writes.
- It touches only rows whose queue row still carries our new brief.
- Each row is one D1 batch: first the queue update, then the state. The state follows from the queue
  (which now holds the old brief), so if a batch were ever cut short, running rollback again finishes it.
- `verify` then puts `force` back to its snapshot value.
- `--dry-run` lists what would change and writes nothing.
- Give exactly one of `--all`, `--slice` or `--rids`.
