# Passage display fixes

The TestFlight examples are reproducible in the local corpus and the committed
evidence shards. The fixes operate on export and serving paths, without changing
the stored corpus or knowledge box.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Opposition senatorsinterjecting—`, `Senator Allisonuntil`, `whistleblowersAndrew Wilkie` | OpenAustralia scrapers (`download_hansard.py` and `download_hansard_fast.py`) use `get_text(strip=True)` with an empty separator; the speech loader also strips tags with an empty replacement. Inline boundaries are lost before both `text` and `text_clean` are stored. | Shared Python/TypeScript display helpers preserve spaces between words across inline tags and newlines across block tags. Conservative, audited replacements recover the reported joins in already-stored text, without splitting legitimate names such as McDonald or eBay. |
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

## Regenerating existing static evidence

Existing `portal/public/evidence` shards need re-exporting. No corpus repair,
knowledge-box patch or sidecar rescan is necessary: the exporter reconstructs
windows even from old sidecars. Use the normal complete-export inputs and a fresh,
empty output directory, then run the source audit before publishing the result.
For the documented desktop inputs, from the repository root:

```sh
OPAX_PASSAGE_DATA="$HOME/.cache/autoresearch"
OPAX_PASSAGE_OUTPUT="$(mktemp -d /tmp/opax-passage-evidence.XXXXXX)"
python3 scripts/export_evidence_layers.py \
  --source "$OPAX_PASSAGE_DATA/parli.db" \
  --evidence "$OPAX_PASSAGE_DATA/evidence-layers-full.sqlite" \
  --places "$OPAX_PASSAGE_DATA/evidence-places.sqlite" \
  --decisions "$OPAX_PASSAGE_DATA/evidence-identity-decisions.sqlite" \
  --additional "$OPAX_PASSAGE_DATA/evidence-additional-mentions.sqlite" \
  --output "$OPAX_PASSAGE_OUTPUT"
python3 scripts/audit_evidence_export.py \
  --source "$OPAX_PASSAGE_DATA/parli.db" --export "$OPAX_PASSAGE_OUTPUT"
```

The source and sidecars are opened read-only. This command only creates local
export files; installation/publication belongs to the orchestrator. Do not use
the preview/incomplete flag for a published export.

Every subsequent evidence re-export applies the fix automatically once it uses
this code. At this revision, the checked-in `scripts/vm/nightly.sh`,
`scripts/daily_refresh.sh` and `scripts/weekly_refresh.sh` contain no invocation
of the evidence exporter. The VM's documented boot schedule is 03:15 Sydney, but
that alone does not refresh these shards. If an external nightly step invokes
the exporter, its next run after merge corrects the files; otherwise a one-off
re-export is required.

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
