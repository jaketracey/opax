# Bill summaries backfill, 10 November 2026

About 1,278 federal bills with an explanatory memorandum (or a legacy ALRC memorandum
resolved during the run) had no "In short" summary. This release adds them in waves.
Each wave adds only summaries: other registry fields in the committed bill files are left
as they were.

## How each summary was produced and checked

1. **Draft.** A model wrote the draft from the memorandum held in the private source
   pack: three sentences, three to six changes, one affected line, and a verbatim quote
   for every public line. The pack's checker (`scripts/bill_summaries/check_summaries.py`)
   enforced the contract: word limits, "would" wording, no em dashes, quotes copied
   exactly, and no long copied runs.
2. **Fact check.** A separate lane re-read the source and rejected any claim it did not
   support. Rejected drafts were revised from the source and checked again.
3. **Affected and retains audit.** One uniform pass covered every draft, including
   drafts already accepted. The affected line names only groups that the source
   identifies as liable, covered, regulated, eligible or protected; administrators,
   officials and agencies that only run or enforce something are removed. "Retains" or
   "preserves" is used only for existing law, never for a safeguard the bill adds. Every
   draft has a ledger entry, and any draft the audit changed was fact-checked again.
4. **Neutrality.** Politically charged bills had a second, neutrality-focused review,
   and a bill is published only once that review accepts it. These cover the Voice and
   referendums, treaty, Israel and Gaza, industrial relations, climate and net zero,
   nuclear power, migration and citizenship, electoral law, protest, hate and terror
   offences, gambling, live export, voluntary assisted dying, religion and marriage.
5. **Gate.** `scripts/bill_summaries/reconcile.py --gate` releases a bill only when all
   of these hold:
   - the checker passes;
   - the fact review accepts, comes from another lane and is newer than the draft;
   - any fix is still present (a guard added after a sync step overwrote fixes);
   - the audit ledger entry exists;
   - a charged bill has a neutrality accept newer than the draft;
   - nothing is held.

   `scripts/bill_summaries/apply_summaries.py` then copies only `summary`, `sources`,
   `has_summary` and `summary_version` into the committed projection.

Provenance records the writing model in each summary, Claude Fable 5.1 or GPT-6.1
(Codex). It also records the reviewing lane and model under `review.independent_check`
and, for charged bills, under `review.neutrality_check`. These were model reviews, not
human or legal reviews. Rows are stored as `review_state='ok'` in `bill_summaries`.
Earlier rows and a full table backup are kept with each wave on the desktop, at
`~/.cache/autoresearch/bill-summaries-20261110/waves/`. Source text is not published.

## Waves

| Wave | Bills | Notes |
|---|---|---|
| 1 | 294 | 289 Codex-written and 5 Fable-written; 9 charged, each with a neutrality accept |
| 2 | 674 | 607 Codex-written, 67 Fable-written; 66 charged, each with a neutrality accept |
