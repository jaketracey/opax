# Bill enrichment authored in the Codex session

The 13 September session used Codex agents to write topic labels and short, source-backed overviews. It did not invoke OpenRouter generation, recreate the bill labeller, or restart the automatic publisher. Codex model usage still applies; this is not a claim that model work is free.

## Reviewed snapshot

The fixed source snapshot at `2026-09-13T04:02:20.074662+00:00` contains 358 complete versions across 222 federal bills, totalling 17,222,856 source characters. Of those versions, 221 had already been published. This is a bounded snapshot of the ongoing source import, not the entire historic bills collection.

The reviewed records are preserved in [bill-enrichment-2026-09-13.json](data/bill-enrichment-2026-09-13.json). Every record identifies the exact version and original text SHA-256, contains a 12–70 word overview of selected provisions, and includes literal supporting passages with source section IDs. Topic labels use the existing taxonomy. An empty topic list means that the selected provisions did not support a sufficiently specific taxonomy match.

Two `gpt-5.6-luna` agents drafted disjoint groups at medium reasoning effort. Their output was not adequate to publish: it included generic descriptions and weak evidence. The coordinating `gpt-6-astra` agent and the existing reviewing agent rewrote the final records from the original provisions. Final record provenance identifies that review model. These are AI overviews of selected provisions, not comprehensive legal summaries or human legal reviews.

## Publication boundary

`scripts/publish_codex_bill_enrichment.py` validates each entry against the saved source database and validates the live original text checksum again before patching. It writes only `usermetadata` topic classifications and `extra.metadata.codex_enrichment`, preserving unrelated metadata and non-topic labels. It never writes source text, title or the KB summary field, creates resources, requests reprocessing, or configures generative tasks.

The publisher refuses to write while automatic tasks are enabled or running. It backs up prior metadata, checks for a null processing sequence in every write response, and reads each result back. Missing resources are recorded as `unpublished`; their reviewed enrichment remains staged. Repeating the same input is idempotent.

The completed run enriched all **221 already-published versions across 144 bills**. The remaining **137 reviewed versions** are staged because their original text resources have not been published. The [final receipt](data/bill-enrichment-2026-09-13-receipt.json) contains 192 unchanged records from the earlier batches, 29 final-batch writes with null processing sequences, and 137 unpublished records. A final task check reported zero running tasks and zero enabled configurations; the automatic publisher remained inactive and disabled, while the source-only crawler remained active.

This boundary matters because the KB's existing automatic summaries can incur OpenRouter charges when source content is processed. Upstream NucliaDB's [`maybe_send_to_process` implementation](https://github.com/nuclia/nucliadb/blob/main/nucliadb/src/nucliadb/writer/api/v1/resource.py) only sends populated processing fields. The metadata-only smoke update returned `seqid: null`, preserved the source checksum and `PROCESSED` status, and left zero running tasks. No processing request was observed for this enrichment run.

The previous [OpenRouter stop instruction](2026-09-13-bill-text-openrouter.md) remains in force. The source-only crawler can continue collecting text. Unpublished text must not be ingested through the old automatic publisher as part of this workflow.

## Reproducible validation

The private source snapshot and redacted receipts are retained under `~/.cache/opax/codex-bill-enrichment-20260913/` on the operator machine and `~/.cache/opax/bill-text-import-20260913/` on the desktop. Credentials stay in the existing protected environment file.

```sh
python3 scripts/publish_codex_bill_enrichment.py validate \
  --snapshot /path/to/codex-enrichment-snapshot.sqlite \
  --input docs/operations/data/bill-enrichment-2026-09-13.json \
  --out /path/to/validated.json
```

The `publish` command requires the same snapshot and validated input, an environment file, and an output receipt path. It defaults to a read-only plan; `--apply` explicitly enables metadata writes. Do not use an unrelated or newer source snapshot for a record whose checksum differs.

## Bill reader

Complete published versions display an **In this version** overview, topic links, and an expandable **Supporting passages** list linking to the relevant original section. The server checks enrichment identity, hash, confidence and evidence before exposing it. Invalid notes are omitted while original bill text remains readable. Switching versions loads that version's own notes.

Validation: 512 portal tests, TypeScript checks and four focused Python tests passed. The Python checks cover evidence identity, the metadata-only write boundary, preservation of unrelated metadata, and rejection of a changed live body even when its metadata hash is forged.
