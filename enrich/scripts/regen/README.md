# 5b-cheap brief regeneration

A one-off, bounded rerun of selected Workers AI briefs with `@cf/qwen/qwen3.8-27b` (thinking off).
The 5b audit found Workers AI briefs had a 6.4% serious-error rate, clustered in two places:
- 1998-2000 zenodo turns;
- committee witness turns written up as askers.

Slices, in order:
1. **zenodo:** the 1998-2000 Workers AI briefs.
2. **witness:** witness turns whose brief opens with or contains an asker verb, opens "Moved", or
   puts a statement on the committee.
3. **gptoss:** the remaining gpt-oss escalations, if the cap leaves room.

## How a brief gets written

The runner never writes the knowledge box. For each row it does these steps:

1. **Snapshot first** (`seed`). It copies the queue row's current brief and model into
   `regen_5b_cheap` before anything is generated. A re-seed never replaces a snapshot.
2. **Checks.** It re-reads the queue row and the live KB brief. If either differs from the snapshot,
   the row is skipped and nothing is spent.
3. **Generation.** It generates with the Worker's own `generate()`: the same prompts, schema,
   validators, retry and gpt-oss escalation.
   - qwen3.8 runs at `max_tokens` 256 with `enable_thinking: false`.
   - gpt-oss keeps 4000.
   - For witness rows, variant `role` adds `speaker_role` to the record, plus one prompt line and
     validator check: never open "Asked" or "Moved".
4. **Hand-off.** It sets the queue row to `status 'done', outcome 'unwritten', force 1,
   model <actual model>, result <new brief>`, but only if the row still holds the snapshotted brief.
   The Worker's live tick then delivers it like any other stored result: `flush` calls
   `writeItem(force)` and the row returns to `outcome 'written'`. The prompt version (`5b-cheap-1`)
   and variant are recorded in `regen_5b_cheap`.

## Guard (`guard.ts`)

**Metering**
- Every call writes a reservation (its upper bound, the Worker's `callUpper`) to an fsynced JSONL
  ledger before it goes out. Afterwards it writes a settlement with the actual neurons, taken from
  the response's `usage` at the published rates.
- Missing usage is booked at the upper bound.
- A reservation with no settlement (a crash mid-call) counts at its upper bound.
- The ledger is rebuilt on start.

**Caps:** checked before every request.
- **Run cap:** the run stops at US$30 actual. The check is "spent + this call's upper bound > cap".
- **Daily share:** "ours today + upper ≤ 1,500,000 − max(Worker spend so far today, Worker
  headroom)", where the headroom is 1.2 × the Worker's peak day over the last 30 days (its D1 `spend`
  table).
- When the share is used up, the run pauses to the next UTC day (`--wait`) or exits.
- The Senate and NSW backfills are not paused.

**Stops:**
- any 402, 403 or 429;
- any other status ≥ 400, except 400, 413 or 422, which skip that row only;
- billing, quota or limit wording anywhere outside the model's own text, including in a 200 body;
- a network error (booked at the upper bound);
- `success: false`;
- a model with no published price;
- the `STOP` file, checked before every request.

**Resume:** no brief is paid for twice.
- Each generated brief is fsynced to `results.jsonl` before D1 is updated.
- At start-up, a row left `generating` reuses its stored result.
- With no stored result the row becomes `interrupted` and is never retried automatically.
- A request that got no answer (a network error) may have been billed. Its row also becomes
  `interrupted`.
- Workers AI uses wrangler's OAuth login, which wrangler refreshes only once it has expired. Within
  2 minutes of expiry the runner waits it out, then refreshes through `wrangler whoami`. If the token
  still can't be read, the run stops.

## Commands

State lives in `~/.cache/opax/regen-5b-cheap/`: `ledger.jsonl`, `results.jsonl`, `run.log`,
`account` and `STOP`.

**Tokens**
- D1 uses `~/.cache/opax/cf-deploy.token`.
- The KB uses `~/.cache/opax/kb.env`. It is read only.
- Workers AI uses wrangler's existing OAuth login, refreshed through `wrangler whoami` before it
  expires. Set `WRANGLER_BIN` if `enrich/node_modules` is absent.

```sh
node scripts/regen/cli.ts headroom                       # read-only: the Worker's peak day and our daily share
node scripts/regen/cli.ts init                           # create regen_5b_cheap (IF NOT EXISTS)
node scripts/regen/cli.ts seed --run 5b-cheap-1 --slice zenodo --variant b --seq-base 1000000 --rids zenodo.json
node scripts/regen/cli.ts run --run 5b-cheap-1 --limit 50 [--compare]   # pilot
node scripts/regen/cli.ts release --run 5b-cheap-1 --variant role|b [--dry-run]   # pilot: queue the chosen variant
node scripts/regen/cli.ts run --run 5b-cheap-1 --wait    # full run, pausing at each day's share
node scripts/regen/cli.ts verify --run 5b-cheap-1        # queued -> written once the Worker has written them
node scripts/regen/cli.ts status --run 5b-cheap-1        # the daily progress line
touch ~/.cache/opax/regen-5b-cheap/STOP                  # halt before the next request
```

## Rollback (one command)

```sh
node scripts/regen/cli.ts rollback --run 5b-cheap-1 --all [--dry-run] [--limit 3]
node scripts/regen/cli.ts rollback --run 5b-cheap-1 --slice witness
node scripts/regen/cli.ts rollback --run 5b-cheap-1 --rids <rid>,<rid>
```

- Rollback hands each old brief back the same way: a forced `unwritten` queue row, which the
  Worker's next tick writes.
- It touches only rows whose queue row still carries our new brief.
- `--dry-run` lists what would change and writes nothing.
