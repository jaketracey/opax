# Bill summaries: revise rejected drafts ({BATCH})

You are revising draft "In short" bill summaries for OPAX (opax.com.au), a non-partisan record of the Australian Parliament. An independent reviewer rejected each draft below with specific issues. Your job is to fix every issue from the source, keep everything else that was right, and leave the draft in the exact file shape it already has.

## Where things are

- Pack root: `{ROOT}`
- Sources: `{ROOT}/sources/<bill_key>.txt` (the source text) and `{ROOT}/sources/<bill_key>.json` (bill facts, basis, dates, hashes)
- Checker: `python3 {CHECKER} --root {ROOT} --out <out dir> <bill_key>`
- Work units ({COUNT} bills). For each unit, the keys file lists the bills, the draft is `<out dir>/<bill_key>.summary.json`, and the reviewer's verdict with its `issues` list is `<reviews dir>/<bill_key>.review.json`.

{UNITS}

## For each bill

1. Read the review's `issues`. Each has the public text at fault (`claim`), the `problem` (usually citing the source wording) and a `severity`.
2. Open the source and read the passages the reviewer cites, plus anything else needed to state the point correctly (grep the file for the figures, clause numbers and terms involved).
3. Edit the draft in place: rewrite the sentence, change or affected line so it is supported by the source as the reviewer describes, keeping the contract (exactly three sentences; three to six changes; one affected sentence; 100 to 260 words of public text; neutral "would" wording; no em dashes; acronyms explained on first use; no copied runs of twelve or more source words). Update the matching `evidence` entries so every public line still has a verbatim supporting quote (4 to 80 words copied exactly from the source); add a new quote when the fix rests on a passage not already quoted. Do not change `source`, `basis`, `as_of`, `model`, `provider`, `prompt_version` or `generated_at`.
4. Where a reviewer's issue cannot be fixed because the source does not support any version of the claim, remove the claim (and its evidence) and, if that would leave fewer than three changes, replace it with a different change the source does support.
4b. While the draft is open, apply two standing rules even where the reviewer did not raise them: the affected line names only groups the source names or clearly describes as liable, covered, regulated, eligible, protected or otherwise affected (never administrators, officials, staff, agencies, regulators or ministers that only run, enforce or fund something, and never a companion bill's groups); and "retains", "preserves", "keeps", "maintains" or "continues" is used only for existing law the bill keeps, never for a safeguard, exclusion or exception the bill adds.
4c. Where a unit gives coordinator notes for a key, they are instructions from the source review: apply them, checking each against the source.
5. Append to `summary_json.review.method` one sentence beginning "Revised after independent review (10 Nov 2026): " saying what you changed.
6. Run the checker on the key; fix every FAIL; run it again until it passes.
7. Write `{ROOT}/batches/_audit/ledger/<bill_key>.json` (create the directory if missing): `{"bill_key": "<key>", "result": "rewritten" or "unchanged", "lane": "{BATCH}", "audited_at": "<ISO UTC now>", "removed_groups": [...], "retains_fixed": [...], "note": "fixer applied the affected and retains rules"}`.

## Rules of engagement

- Fix only what the issues raise, and anything you notice that the source plainly contradicts. Do not restyle accepted wording.
- Write only the draft files named above and their ledger files. Never edit the sources, the reviews or anything else. No git commands.
- Do not send messages to any other agent or session; your final message is your report: for each key, one line on what changed, and any issue you could not resolve (with the reason).
