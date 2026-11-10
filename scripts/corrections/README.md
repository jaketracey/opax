# Reviewed corrections

One-off fixes to published records live here, one file per dataset:
`scripts/corrections/<dataset>.json`. The exporter that owns the dataset loads
the file with `scripts/corrections/apply.py` and applies it to the records it is
about to publish. Fix the code that produces a defect first; a correction is
for a record that no rule can fix, or a rule cannot yet prove.

## Entry format

The file is a JSON list. Every entry has exactly these fields:

```json
{"id": "federal-representatives-5650", "field": "result",
 "from": "negative", "to": "affirmative",
 "evidence_url": "https://data.openaustralia.org.au/scrapedxml/representatives_debates/2019-02-12.xml",
 "evidence": "Representatives 2019-02-12, division 1: divisioncount ayes 75, noes 74, equal to the named aye and no lists including tellers; a majority of 1 for the ayes.",
 "finding": "divisions-votes-002", "reviewed": "2026-11-10"}
```

- `id`: the record's published id (the key the exporter passes as `key`).
- `field`: a top-level field, or a dotted path into nested objects
  (`_meta.duplicate_of`). A missing key reads as `null`.
- `from`: the exact value the record holds now, before correction.
- `to`: the corrected value. `null` clears a field.
- `evidence_url`: the original public source (aph.gov.au or ParlInfo Hansard,
  OpenAustralia XML, a state Hansard, the AEC register, AusTender and so on).
  Not OPAX, not a news story when the record itself is available, never blank.
- `evidence`: what that source says, quoted or closely paraphrased, enough for
  a reviewer to find the line.
- `finding`: the finding id that raised it.
- `reviewed`: the ISO date someone read the source and checked the entry.

## Evidence rules

1. Read the source yourself. Never write a correction from memory, model
   knowledge, arithmetic on other fields, or another aggregator's summary.
2. One record and one field per entry, each with its own source URL. Two fields
   of one record are two entries (they may share a URL).
3. Correct only what the source states. When the source does not settle a
   value (a House tie decided by a casting vote you have not read, an
   affiliation on a date the source does not give), leave the record alone or
   clear the field; do not guess.
4. Neutrality: a correction restores what the record says. It never
   characterises a person, party or donor beyond it.

## Why it fails loudly

`apply()` changes a field only while it still holds `from`. If the source is
fixed, the record changes or the record disappears, the export stops with a
`CorrectionError` naming the entry, and nothing is changed. Review it: delete
the entry when the source now agrees, or re-read the source and update
`from`. Do not edit `from` just to make the export pass.

Publication guards (for example the division retention guard in
`scripts/export_division_pages.py`) accept a changed source fact only when a
matching entry here explains it, so a correction is the reviewed exception,
not a way around the guard.

## Checking

```sh
python3 scripts/corrections/apply.py            # validate every file
python3 -m unittest scripts/corrections/test_apply.py
```
