# Victorian divisions, 60th Parliament (2022 to 2026)

Written by `parli/ingest/vic_divisions.py parse` from the daily Hansard PDFs of the Parliament of
Victoria (reuse by permission, see `docs/SOURCES-ACCESS.md`). Method and counts: `docs/VOTES.md`,
"Victoria, the whole 60th Parliament".

- `divisions.jsonl`: one reconciled division a line, with its Hansard link, date, stated tallies, result
  line, heading, question as printed and every named vote.
- `mismatches.json`: divisions that are not published, each with its Hansard link, the stated and the
  parsed counts and the reason.
- `manifest.json`: the counts, and each sitting day's PDF link and SHA-256.
