# Corpus repair and enrichment, 8 September 2026

The desktop database is `/home/jake/.cache/autoresearch/parli.db`.

## Website footer

All 63,118 matching rows were cleaned in `text_clean`; raw source text remains intact. Previous cleaned fields are backed up in `opax_footer_backup_20260908`. The shared `speech_hygiene` cleaner prevents the footer returning on future imports. It also handles a suffix glued to a truncated source line (speech-770332), preserving the incomplete source fragment without reconstructing it.

Live corpus text updates are queued with reason `text:openaustralia_website_footer` in `ext_kb_patch_queue`. Text repairs PATCH only text fields, preserving topic classifications and summary fields. Speech-1205147 was verified directly in the knowledge box and public resource API without the footer.

The desktop user service `opax-footer-repair.service` drains the queue with six threads. It is enabled at boot; user lingering is enabled. Logs: `/tmp/opax-footer-service.log`. A clean source record marked `missing` is not currently present in the knowledge box; future imports use its corrected text. Inspect `failed` and `pending` counts before calling the live backfill complete. The script supports `--retry-failed`.

```sh
ssh desktop 'systemctl --user status opax-footer-repair.service --no-pager'
ssh desktop 'tail -5 /tmp/opax-footer-service.log'
```

Portal `CACHE_EPOCH` was advanced to `2026-09-08-footer-cleanup`. The document reader also strips the exact footer suffix from older browser-cached resource responses. Bump the corpus epoch again after the live backfill drains so retrieval and answers cached during the repair refresh.

## Enrichment

The active queues remain on the Mac at `~/.cache/opax/{labels,summaries}_queue.sqlite`, with government-record briefs in `~/.cache/opax/release_summaries_queue.sqlite`. Four launch agents run from `/private/tmp/opax-codex-enrichment`: two speech-topic workers, one speech-summary worker and one government-release-summary worker. The summary runner accepts concise short-question briefs, asks for full years, identifies each record kind and logs validation failures. Source-number checks remain active. Live sampled speech and release briefs matched their saved source text.

All four processes share a filesystem write lock for knowledge-box PATCHes and honour the platform's reported retry time. Model work remains parallel; only the short publication step is serialised. This prevents ingestion backpressure from turning valid completed batches into permanent queue errors.

At the operational check there were roughly 77,000 label reviews and 575,000 summaries remaining. They are not complete. Short-term throughput is not a completion guarantee.

The desktop CLI was installed at `/home/jake/.npm-global/bin/codex`, version 0.153.4. Its existing login fails with an already-used refresh token. The user must sign in on the desktop before workers can move there. Do not copy a live refresh token between machines or run independent copies of the same queues. Stop the Mac fleet and transfer a consistent SQLite backup before enabling the replacement desktop fleet.
