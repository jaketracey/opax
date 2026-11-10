# Bill summaries: uniform affected-line and "retains" audit ({BATCH})

You are auditing draft "In short" bill summaries for OPAX (opax.com.au), a non-partisan record of the Australian Parliament. Independent reviewers have applied two rules unevenly, so this pass applies them uniformly to every draft listed, including drafts that were already accepted. You fix only these two kinds of error, from the source, and record what you did for every draft.

## Where things are

- Pack root: `{ROOT}`
- Sources: `{ROOT}/sources/<bill_key>.txt` (the source text) and `{ROOT}/sources/<bill_key>.json` (bill facts)
- Checker: `python3 {CHECKER} --root {ROOT} --out <out dir> <bill_key>`
- Ledger: `{ROOT}/batches/_audit/ledger/<bill_key>.json` (create the directory if missing; one file per draft, every draft gets one)
- Work units ({COUNT} drafts). For each unit, the keys file lists the bills and the drafts are `<out dir>/<bill_key>.summary.json`.

{UNITS}

## Rule 1: the affected line names only groups the source says are affected

Split `summary_json.affected` into its groups. For each group, search the source (`grep -a -n -i` with a short distinctive term, or read the outline) for where the source names or clearly describes that group as liable, covered, regulated, eligible, protected, entitled or otherwise affected by this bill. Not supported, and to be removed:
- administrators, officials, staff, agencies, departments, regulators, courts or ministers that the source mentions only as running, enforcing, funding or deciding something (for example "customs administrators" when the bill regulates importers, "the Australian Taxation Office" when it collects a levy);
- groups inferred from a budget line, from "the community", "the public" or "all Australians" unless the source says so;
- groups covered only by a companion bill when the memorandum is joint.
An agency is supported only when the bill itself changes that agency's powers, duties, membership or existence and the source says so.

## Rule 2: "retains", "preserves", "keeps", "maintains", "continues" must describe existing law

Search the sentences and changes for retain, preserve, keep, maintain, continue, remain, still and existing. For each, check the source: if the safeguard, exclusion, exception or power is one the bill **adds** (new section, new requirement, "would insert", "introduces", "new subsection"), the wording is wrong. Rewrite it as what the bill would add ("would add an exception for ...", "would require ..."). Keep "retain" wording only where the source says the existing law already provides it and the bill keeps it.

## For each draft

1. Apply both rules. If nothing needs to change, leave the draft file untouched.
2. If something needs to change: edit the draft in place. For rule 1, rewrite the `affected` line to name only supported groups (one sentence, 5 to 45 words, ending with a full stop, neutral wording). For rule 2, rewrite only the faulty clause of the sentence or change. Update the matching `evidence` entries so each edited line's `claim` matches the new text exactly and its `quote` is a verbatim 4 to 80 word source excerpt that supports it. Append to `summary_json.review.method` one sentence: "Affected and retains audit (10 Nov 2026): <what changed and why>." Keep the contract: exactly three sentences, three to six changes, 100 to 260 words of public text, "would" wording, no em dashes, no copied runs of twelve or more source words. Run the checker on the key and fix any FAIL until it passes.
3. Write the ledger file for every draft, changed or not:
```json
{"bill_key": "<key>", "result": "unchanged", "lane": "{BATCH}", "audited_at": "<ISO UTC now>", "removed_groups": [], "retains_fixed": [], "note": ""}
```
`result` is `unchanged` or `rewritten`; list each removed group and each rewritten retains clause.
4. Never touch `source`, `basis`, `as_of`, `model`, `provider`, `prompt_version` or `generated_at`, and do not restyle anything else.

## Rules of engagement

- Edit only the draft files named in the units and the ledger files. Never edit the sources, reviews or anything else. No git commands. No network access is needed.
- A draft file that does not exist was skipped by its writer: write no ledger for it and note it in the report.
- Do not send messages to any other agent or session; your final message is your report: drafts checked, rewritten count, and one line per rewrite (key: what was removed or reworded and why).
