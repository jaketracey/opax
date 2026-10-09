# Passage display fixes

The TestFlight examples are reproducible in the local corpus and the committed
evidence shards. The fixes operate on export and serving paths, without changing
the stored corpus or knowledge box.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Opposition senatorsinterjecting—`, `Senator Allisonuntil`, `whistleblowersAndrew Wilkie` | OpenAustralia scrapers (`download_hansard.py` and `download_hansard_fast.py`) use `get_text(strip=True)` with an empty separator; the speech loader also strips tags with an empty replacement. Inline boundaries are lost before both `text` and `text_clean` are stored. | Shared Python/TypeScript display helpers preserve spaces between words across inline tags and newlines across block tags. General marker and roster rules recover historical joins; there are no example-specific replacements or general camel-case splitting. |
| Search resource `855d6df1c8c1429df4e4123c7557373b` / speech 1198151 has `whenMalcolm Turnbullwas` and `WhenJoe Hockeywas` | The same joins are already in the local speech's `text` and `text_clean`; search forwarded retrieved paragraph text unchanged. | Normalize before search term matching and before windowing. Full source reads and Ask source snippets use the same helper. |
| Speech 1249416 contains `&#38;` and `\n\n So` | Speech hygiene decodes numeric entities before adding the committee topic prefix, which contains the entity. Existing export and serving paths do no final entity decode or paragraph-edge whitespace cleanup. | Decode once after stripping actual markup, then collapse whitespace and trim paragraph edges. Nested `&amp;#38;` becomes literal `&#38;`, and encoded literal tags stay text. |
| Evidence begins `ransport Legislation Committee` / ends `We know perso`; Ask cuts at 600 | Primary/additional evidence builders slice 160 characters on either side of a mention. Export copies those old windows verbatim. Worker search, Ask and evidence helpers also use character limits, with incomplete boundary handling. | Rebuild exported windows from read-only source rows using original mention coordinates. Share word-boundary clipping in each language; add an ellipsis only for omitted content, counting markers inside the limit. Ordinary search and Ask source snippets remain at most 600 characters. |

Original `matched_text`, `start`, `end`, fingerprints and response field names
remain unchanged. `details.excerpt` and the public `text` carry the same cleaned
display excerpt. The source audit still checks the original span and fingerprint,
and also checks the rebuilt display. Source, sidecar and output shapes remain
unchanged; `votes.json` remains byte-identical with schema 1.

Search page/window, source-body and Ask cache versions retire old display payloads.
The Worker serving fix takes effect when the orchestrator deploys this commit.

## General historical-join rules

`interjecting`, `interjection` and `interjections` are split from a preceding
letter run, with word boundaries around the entire match. The local exported
vocabulary has no legitimate ordinary word ending in these markers: prefixed
forms are lost boundaries such as `membersinterjecting` and `ceaseinterjecting`.

Names come from `portal/public/parliamentarians.json`: 1,234 full names and 1,064
surnames. Python reads that roster directly, so standalone exports need no Node
build. `scripts/build_passage_names.mjs`, included in `npm run build:search`,
generates a 64,495-byte committed projection bundled into the Worker. A parity test
compares the complete Python roster projection with the generated Worker input.
Each helper builds one escaped, longest-first name regex.

A lowercase letter before a complete roster full name acquires a space. After
a full name or `Senator <Surname>`, only 16 lowercase function
words acquire a space, and only at a word boundary. The ambiguous suffixes
`on`, `in`, `is`, `as`, `at`, `by`, `to` and `the` are excluded completely. A
surname plus suffix that is itself a roster surname or name token is also
protected, including when the first name differs from the roster full name. A name embedded in a longer
word is left alone. Other honorific surname forms are recognized but do not get
suffix repairs: corpus review caught `Mr Finnin`, `Mr Jenkinson`, `Ms Erin`,
`Mr Leon` and `Dr Erin` being mistaken for surname/function-word joins. These
observed cases are now negative fixtures. This deliberately leaves uncertain
non-Senator surname joins unchanged.

## Offline corpus audit, round 1 (2026-10-09)

`scripts/audit_passage_joins.py` reads every JSON export under `portal/public`
(including the freshly built search catalog) and the saved bill-enrichment
export under `docs/operations/data`. It reads no database and makes no network
calls. The scan contains 505,444 passage fields in 11,435 JSON files: 504,526
public fields and 918 saved source quotes. No saved bill-enrichment quote changed.

| Rule | Changed exported fields | Changed canonical evidence rows | Inserted spaces |
| --- | ---: | ---: | ---: |
| Interjection markers | 22 | 11 | 26 |
| Before a full name | 74 | 35 | 81 |
| After a full name / Senator surname | 49 | 21 | 52 |

Counts overlap between rules. There are 124 changed fields overall, including
58 canonical evidence `text` rows, their 58 `details.excerpt` mirrors, and eight
report passages. Canonical evidence counts avoid counting those mirrors twice.
Join repairs alone touch 48 evidence shards. The larger normalization benchmark
below also measures whitespace/entity cleanup and therefore changes more rows.

Twenty seeded random before/after field samples per rule (seed 20261009), their
JSON pointers, complete field text, rule counts and input fingerprint are saved
under the gitignored `portal/private/passage-text-round1/` in `samples.md`,
`samples.json`, `changed-fields.jsonl` and `summary.json`. All 60 final samples
were reviewed without a false split. Python and TS also agree on all 124 changed
fields. Ten shortened samples from those selections:

| Before | After |
| --- | --- |
| `will ceaseinterjecting` | `will cease interjecting` |
| `Mr Windsorinterjecting—` | `Mr Windsor interjecting—` |
| `Honourable membersinterjecting—` | `Honourable members interjecting—` |
| `MrDarren Zanow` | `Mr Darren Zanow` |
| `ministerMichael Lee` | `minister Michael Lee` |
| `colleagueRachel Siewertand her team` | `colleague Rachel Siewert and her team` |
| `misspeltJohn Robertson` | `misspelt John Robertson` |
| `Senator Wattfor the commitment` | `Senator Watt for the commitment` |
| `Kim Carrin 2013` | `Kim Carr in 2013` |
| `Senator Robertsto my answers` | `Senator Roberts to my answers` |

## Round 2 review fixes and measurement (2026-10-09)

Negative fixtures protect Williamson, Morrison, Ellison, Harrison, Robertson,
Hutchinson, Parkin, Leon and Bellis. The shared fixture contains 65 normalization
cases plus seven windows. A generated test checks all 22 full-name/suffix pairs
whose joined last token is present in this roster; the removed short words also
cover the review's remaining dictionary-word collisions.

Markup removal now uses a single-pass scanner with a known HTML tag-name set.
Unknown tag-like text such as `if x <y and z> 3` and unterminated markup remain
literal. Closed comments are stripped. The existing inline-boundary trade-off
remains: `<b>bo</b>ld` becomes `bo ld`, and `x<sup>2</sup>` becomes `x 2`.
Entities require a semicolon and decode once; unknown named entities stay
literal. Python's numeric entity handling follows the same HTML code-point rules
as `decodeHTMLStrict`, including C1 replacements and retained noncharacters.

`/api/resource` excludes bill text from normalization, preserving the verbatim
indentation, tabs and entities used by `/doc`. Both window helpers clamp `end`
to the text bounds, use ECMAScript whitespace and measure offsets/caps in UTF-16
units. Python converts normalized evidence coordinates to that unit; stored
source offsets and hashes remain unchanged. Astral-character fixtures verify
that windows stay whole and never exceed the same cap in either language.

The exporter rebuilds a window only after the raw source SHA-256 matches the
sidecar fingerprint. A missing or changed fingerprint uses the normalized old
excerpt, preserving its provenance; the subsequent source audit still rejects
drift. Fixture DB tests cover both fallback cases and read-only inputs.

The 64,495-byte roster projection is committed, so `tsc` and focused tests work
before `build:search`. An artifact-free temporary checkout of tracked source,
declarations and fixture dependencies passed Wrangler type generation, `tsc`
and 83 focused Node tests without a search build. `build:search` regenerates the
projection deterministically. Roster data publications should carry its matching
projection so fresh-checkout parity remains valid after roster changes.

The same offline scan covers 505,444 fields in 11,435 files. No DB export or
network access was used for measurement.

| Rule | Changed exported fields | Changed canonical evidence rows | Inserted spaces |
| --- | ---: | ---: | ---: |
| Interjection markers | 22 | 11 | 26 |
| Before a full name | 70 | 33 | 73 |
| After a full name / Senator surname | 27 | 11 | 30 |

There are 108 changed fields overall: 51 canonical evidence texts, 51 excerpt
mirrors and six report passages. Rule counts overlap. Twenty random field
samples per rule are in the ignored `portal/private/passage-text-round2/samples.md`;
all 60 were reviewed without a false split. `summary.json` records the input
fingerprint and counts, and `ts-parity.json` confirms agreement on all 108
changed fields. This tightening intentionally leaves short-word joins unchanged.

Five warmed runs on each 102,400-byte adversarial input measured:

| Input | TS median / maximum | Python median / maximum |
| --- | ---: | ---: |
| `<a` followed by spaces | 1.401 / 2.156 ms | 17.221 / 20.592 ms |
| Repeated unclosed `<!--` | 1.223 / 1.298 ms | 11.596 / 15.212 ms |

Both languages have regression tests with a 50 ms bound for these inputs. Full
validation passed 1,022 Node tests and 23 Python tests, TypeScript checking and
the deploy workflow's local build steps. `votes.json` remains byte-identical to
37509561 with SHA-256
`a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

## Evidence publication and recommendation

Existing static evidence needs re-exporting to correct the raw fields consumed
by clients. The producer is `scripts/export_evidence_layers.py`. The documented
last full run was on **desktop**, against
`~/.cache/autoresearch/parli.db`, using four completed sidecars in that cache:
`evidence-layers-full.sqlite`, `evidence-places.sqlite`,
`evidence-identity-decisions.sqlite`, and `evidence-additional-mentions.sqlite`.
Its output `~/.cache/autoresearch/evidence-final-20260908` was copied into
`portal/public/evidence`. The committed metadata still says
`2026-09-08T09:21:53.082961+00:00`; it covers 1,310,477 speeches, 21,234 releases
and 230,007 grants. This provenance is documented in
[evidence-enrichment-layers.md](evidence-enrichment-layers.md#final-export).

There is **no checked-in scheduled evidence export**. Neither the daily/weekly
scripts nor `scripts/vm/nightly.sh` invokes it. The documented refresh-box EC2
schedule starts at 03:15 Australia/Sydney; the checked-in transfer inventory
does not include these four sidecars, and the nightly's allowed data groups
exclude evidence. No external schedule or refresh-box filesystem was inspected.
Merging this fix therefore does not establish an automatic next-night evidence
refresh. Worker responses change when the orchestrator deploys it.

Recommend **a one-off re-export through the reviewed refresh-box nightly path**.
Do not run a desktop export or bypass the completeness gate. Before that run,
the orchestrator must provide sidecars matching the source snapshot: either a
frozen, matching complete set, or sidecars advanced to the current refresh-box
DB. Old sidecars against a growing DB fail the exporter’s exact progress/count,
grant-program and identity coverage checks. Repairing old excerpt windows needs
no corpus rewrite or mention rescan when source and sidecars already match.

The one-off needs an evidence data group with validation/rollback, export to a
fresh empty staging directory, `scripts/audit_evidence_export.py` against the
matching source, then installation and the existing timestamp-only suppression
in `scripts/vm/keep_if_unchanged.py`. Publication remains with the orchestrator's
nightly/deploy flow; this branch makes no production writes and runs no real DB
exports.

Adding this to every nightly is **not yet a safe, small change**. The current
tree is 163,453,646 bytes (155.88 MiB), 515 files: 256 evidence shards, 256 lookup
shards, index, stats and identity links. One staged output plus the old tree is
about 312 MiB before SQLite temporary sorting space. The round-1 local text-only benchmark
normalized all 109,533 exported excerpts in 29.985 seconds, changing 22,561 rows
across all 256 content shards. This excludes full-source reads, the exporter's
million-row SQL grouping/sorting, rebuilding windows, and source audit; **full
export runtime is unmeasured**, so a timed one-off is needed before budgeting a
daily job. Expect a broad first content diff. For identical inputs thereafter,
`generated_at` churn is confined to index/stats and can be suppressed by the
existing sweep; the text fix itself does not change lookup/identity data.

## Local validation

Use Node 24, install portal dependencies, and build the search catalog before
running the Node tests. The deployment workflow's local build/validation steps
can run without deploying. Worker tests use fixture providers and local D1.

On this desktop the host's loopback TCP connections time out. The full suite
and Wrangler runtime type generation run successfully in a temporary user and
network namespace with its loopback interface enabled. That namespace has no
external network interfaces, so the integration tests cannot reach production.

```sh
cd portal
unshare --user --map-root-user --net sh -c \
  'ip link set lo up && node --test test/*.test.mjs'
unshare --user --map-root-user --net sh -c \
  'ip link set lo up && WRANGLER_SEND_METRICS=false npx wrangler types && npx tsc --noEmit'
cd ..
python3 -m unittest tests.test_passage_text parli.tests.test_evidence_layers
```
