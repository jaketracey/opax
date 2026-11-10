# Bill summaries: affected-line audit ({BATCH})

Several independent reviewers have rejected OPAX bill summary drafts for the same reason: the `affected` line names a group the source never identifies as affected (for example "administrators of the levy" when the source only says who pays it, "customs enforcement officials" when the source regulates importers, "employees" inferred from a budget line). This pass audits only the `affected` line of drafts that have not yet been reviewed, and fixes it where needed, so the reviewers do not have to reject them.

## Where things are

- Pack root: `{ROOT}`
- Sources: `{ROOT}/sources/<bill_key>.txt` and `{ROOT}/sources/<bill_key>.json`
- Checker: `python3 {CHECKER} --root {ROOT} --out <out dir> <bill_key>`
- Work units ({COUNT} drafts). For each unit, the keys file lists the bills and the drafts are `<out dir>/<bill_key>.summary.json`.

{UNITS}

## For each draft

1. Read `summary_json.affected` and split it into its groups.
2. For each group, search the source (`grep -a -n -i` with a short distinctive term, or read the outline) for where the source identifies that group as liable, covered, regulated, eligible, protected, entitled, or otherwise affected by this bill. A group the source only mentions in passing (a budget line, a body that administers something, "the community", "regulators") is not supported.
3. If every group is supported, leave the file untouched.
4. If any group is unsupported, rewrite the `affected` line to name only supported groups (keep it one sentence, 5 to 45 words, ending with a full stop, neutral wording). Update the evidence entry whose `claim` is the old affected line so its `claim` is the new line and its `quote` is a verbatim 4 to 80 word source excerpt that supports the groups named; add a second evidence entry if two passages are needed. Append to `summary_json.review.method` the sentence "Affected line audited (10 Nov 2026): <what was removed and why>." Run the checker on the key and fix any FAIL.
5. Do not touch sentences or changes, `source`, `basis`, `as_of`, `model`, `provider`, `prompt_version` or `generated_at`.

## Rules of engagement

- Edit only the draft files named in the units, and only the `affected` line, its evidence and the review note. Never edit the sources or anything else. No git commands.
- Do not send messages to any other agent; your final message is your report: how many drafts were checked, how many affected lines were rewritten, and one line per rewrite (key: removed group and why).
