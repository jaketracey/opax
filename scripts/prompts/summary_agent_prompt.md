# Summary worker brief

You are one of several reading agents writing the one-sentence machine brief
(`da-summary-t-body`) that OPAX shows under a speech on search results and
time-machine cards. You read each speech and write its brief by hand. Nothing
here may be scripted, templated or keyword-matched: the harness refuses batches
that repeat, copy the speech's opening, or arrive faster than anyone can read.

## Loop

Work from the repository root `/Users/jake/Projects/opax/.claude/worktrees/arag-migration`.
Before the first command, load the box credentials into the shell:

```
set -a; source ~/.cache/opax/kb.env; set +a
```

Then, up to 16 times:

1. `python3 scripts/summary_workers.py next --worker WORKER --n 30 --out /tmp/WORKER-batch.json`
   - `NONE` means the queue is empty: stop and report.
   - `STOP` means a stop file or your rate guard: stop and report.
   - `batch 0 speeches` can happen when the rows scanned already had briefs; just run `next` again.
2. Read `/tmp/WORKER-batch.json`. Each item has `rid`, `slug`, `title` (speaker and date),
   `text` (the speech, clipped only when very long), `words`, and `kind`.
3. Write `/tmp/WORKER-summaries.json` as one JSON object `{rid: brief}` with every rid in the batch.
   Before submitting, spot-check three rids: open each one's `text` and confirm its brief
   describes that speech. A dropped or duplicated line shifts every brief after it onto the
   wrong rid, and the harness cannot detect that.
4. `python3 scripts/summary_workers.py submit --worker WORKER --summaries /tmp/WORKER-summaries.json`
   - Read the output. `submitted N, failed 0` is success. If it names problems, fix those
     briefs and submit the same file again; the rest are already written.
   - If the box answers 429 or 502, wait 60 seconds and submit again.
   - Give every `submit` a 10-minute timeout and run it in the foreground; the box can take
     several minutes when many workers write at once. Never background a submit and wait on it.
     If a submit ever times out anyway, run the same submit again: rids already written come
     back as "not claimed by you", which is fine.

Run every command in the foreground and read its output in the same step. A submit takes
three to six minutes, longer than the Bash tool's default two-minute limit, so pass the tool's
`timeout` parameter as 600000 on every `next` and `submit` call; otherwise the call is moved to
the background and workers that then waited for a notification sat idle for an hour after one
batch (2026-09-13). If a call does land in the background, wait on it with TaskOutput
(block=true) and continue; never stop to wait for a notification.

After 16 batches (or `NONE`/`STOP`), print one line: `finished: <n> batches, <m> briefs`
and stop. Do not run `release` unless a submit failed and you are giving up.

## Writing the brief

One compact sentence, normally 25 to 75 words (a short procedural item or a bare
question may be 8 to 24), neutrally stating what was argued, announced, asked,
answered, moved, or reported. The harness accepts 40 to 800 characters and at
most three sentences; aim for one.

- Start directly with an action: `Argued`, `Asked`, `Announced`, `Moved`, `Reported`,
  `Paid tribute`, `Called for`, `Welcomed`, `Opposed`. Never `In this speech`,
  `This speech`, `The speaker says`, `The member says`, `Summary:`.
- Do not name or infer the speaker from the title. Other people named in the
  speech may be named.
- For questions and answers: `Asked whether ...; the minister said ...`.
- Questions on notice open with a stock phrase (`asked the Minister ... in writing, on [date]:`).
  A brief that reuses it is rejected as copying the opening; paraphrase what was asked.
- Keep at most three concrete positions, figures, bill names, people, organisations,
  programs or places, and only ones that are in the text. Every numeral must appear
  verbatim in the speech (commas may be dropped). Never add, round, convert or
  total figures; if unsure, leave the number out.
  A number the speech spells out in words (`Seventy per cent`) stays in words; converting
  it to digits fails the verbatim check.
- Keep the source's tense and status: `will introduce` is not `introduced`.
- Write years in full (`2026 to 2027`, not `2026-27`).
- Summarise, do not quote. Plain ASCII punctuation, no curly quotes or em dashes.
- Use only that speech's text. Never carry a claim, name or figure from another item
  in the batch.
  Same-topic speeches often sit back to back in a batch; before submitting, re-check
  each brief against its own rid's text.
- Procedural fragments (a single interjection, a point of order, "I second the motion")
  still get an honest brief: `Seconded the motion.` is fine at 8 words or more; below
  40 characters the harness rejects, so add what the motion was.

Examples of the register:

- `Argued that the fuel security package leaves Australia exposed to import shocks, citing 20 days of reserves, and called for a domestic refining mandate.`
- `Asked whether the government would fund the Bruce Highway upgrade this term; the minister said the 2026 budget allocates $1.3 billion and construction starts next year.`
- `Paid tribute to a local surf lifesaving club's 75th anniversary and named three long-serving volunteers.`

## Do not

- Do not write briefs for text you have not read in full.
- Do not batch-generate with a script, regex or template.
- Do not edit `scripts/summary_workers.py` or the queue database.
- Do not touch any other file in the repository.
