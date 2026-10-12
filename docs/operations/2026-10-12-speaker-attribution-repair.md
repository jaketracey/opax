# Speaker attribution repair — build and dry run, 12 October 2026

No KB writes, D1 writes, generation, Ask calls, deployment or pushes were performed. The audit commit `8597c63c` was cherry-picked as `bfd8a667`. SQLite was opened with `mode=ro`, `immutable=1` and `query_only=ON`.

The parser uses one XML speech turn per unit, including marked interjections. Office IDs resolve to dated OpenAustralia person IDs through `people.xml` and the membership XML; the existing identity guard checks the printed speaker. Nested turns cannot enter the parent’s text. Source GIDs, source paragraph IDs, citation anchors and original inline extraction are retained. The legacy HTML fallback now closes paragraphs with libxml and traverses bylines in source order. Both downloaders use this fallback.

Chair offices are `speaker_type=chair` plus `chair_role` labels (Speaker, Deputy Speaker, President, Deputy President, Chair, Panel and acting roles). They have no personal collaborator or personal `person_id`; `chair_person_id` and `oa_office_id` retain provenance. The ordinary sync’s OpenAustralia exclusion and the speaker export read the party/office field. Ordinary personal speeches remain identified by their dated office owner.

Implementation: `parli/ingest/openaustralia_xml.py:144`, `parli/ingest/hansard_html.py:7`, `parli/ingest/speaker_roles.py:4`, `parli/ingest/arag_sync.py:71` and `:199`, `download_hansard.py:82`, `scripts/export_speakers.py:38`, `scripts/arag_patch_speakers.py:64`. Planner: `scripts/repair_speaker_attribution.py:152`; gated sync: `:408`.

## Manifest and staging

| Original-document action | Documents |
|---|---:|
| Keep old slug with corrected text/metadata | 0 |
| Split into per-turn units; old slug redirects to primary unit | 16,512 |
| Chair label/attribution metadata only; body and enrichment preserved | 397 |
| Extra missing-source documents left unresolved | 71 |

All 16,909 confirmed documents are represented (16,900 distinct slugs; nine duplicate-slug resources). There are 16,503 distinct redirects. The 72 uncached slugs belong to Senate sittings on 17 August and 12 October 2006. Both scraped and original XML URLs returned 404 through the robots-aware, honest client. One of those slugs, `speech-774402`, can receive its chair label using the recorded party field; the other 71 remain unchanged and unresolved. See [source receipts](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/sources/receipt.json).

`repair-manifest.jsonl` has one entry per original resource ID. `kb-operations.jsonl` contains the planned mutations. `documents/` contains 158,096 new units and 397 chair-only staged documents. There are 159,217 distinct XML turns in the repair, including 1,121 unchanged units whose existing slug and RID are reused without mutation. New slugs use a deterministic hash of the complete source GID: `speech-oa-<24 hex characters>`. Overlapping legacy documents share their canonical units.

Split units are created afresh, so old field-level topic classifications and summaries cannot follow mixed text into a corrected unit. Only after every destination is processed will the 16,512 mixed resources retire by resource ID. This avoids ambiguity in the nine duplicate slugs. The published redirect map must handle both requested `/speech/<slug>` links and the repository’s `/doc/<slug>` and resource readers before retirement.

Unchanged full units retain their published identifiers. `passage-map.jsonl` contains 502,315 exact-text paragraph mappings to source GIDs and new offsets. Its offsets are Python Unicode code points from the read-only `text_clean` snapshot, not platform-generated paragraph IDs. A reader must use that crosswalk for old positional citations; source GID anchors remain stable. Plain old-slug links go to the primary unit. Neither the redirects nor passage migration have been deployed.

Public XML restores or revises source text in 3,752 original documents; those entries list `source_expanded_gids`. There are zero office identity parser issues. Thirteen primary IDs change from stale state IDs to the same named federal person. Another nine numeric federal owners disagree between the legacy row and XML; those proposed redirects are explicitly flagged for review in [identity-conflicts.json](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/identity-conflicts.json). Sync refuses to proceed without that review assertion. The dry run does not establish which of those conflicting original bylines was correct.

## Size and enrichment

The planned write is **702,754,002 bytes** (702.75 MB; 670.20 MiB) of JSON payload: **158,096 POSTs, 397 metadata PATCHes, and 16,512 DELETEs**, or **175,005 mutation requests**. The new source bodies total **243,912,823 bytes** (243.91 MB); chair-only text will not be rewritten. See `staging-validation.json`. The operation ledger also includes captured preconditions; its on-disk size is larger than the transmitted payload.

At an assumed sustained one mutation per second, the mutation phase is **48.6 hours**; at five per second it is **9.7 hours**. These are planning scenarios, not a measured ingest rate. Budget roughly two to three days at the conservative rate, with preflight/destination reads and indexing; platform backpressure can extend it. The shipped sync runner is serial and honours the existing KB client’s backpressure. No write benchmark was run.

**131,484 new personal units require new summaries and topic classification**, with no generation performed. This count includes 2,926 turns with fewer than three words; the current Worker would skip those as `no-text`, so these should become explicit short-turn outcomes rather than repeated generation work. Chair and unattributed procedural units need no personal summary. At least 16,387 existing resource-level topic labels on retired mixed documents are invalidated; field-level labels retire with their resources. Chair-only operations preserve all existing summaries and topics. Reused unchanged units preserve theirs. Topic names/taxonomy and source heading names are unchanged.

## Twenty before/after pairs

Text lengths refer to the cached live KB body where the audit had one, otherwise the read-only database’s cleaned body. Each after file contains all corrected units, their IDs, text and metadata.

| Speaker / old slug | Before chars | After units | Primary chars | Files |
|---|---:|---:|---:|---|
| Melissa McIntosh / speech-826927 | 3,117 | 3 | 473 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/01-speech-826927-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/01-speech-826927-after.json) |
| Milton Dick / speech-826940 | 371 | 2 | 179 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/02-speech-826940-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/02-speech-826940-after.json) |
| Sarah Hanson-Young / speech-787244 | 5,333 | 8 | 511 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/03-speech-787244-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/03-speech-787244-after.json) |
| Milton Dick / speech-826935 | 3,821 | 1 | 3,821 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/04-speech-826935-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/04-speech-826935-after.json) |
| Milton Dick / speech-826936 | 227 | 1 | 227 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/05-speech-826936-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/05-speech-826936-after.json) |
| Milton Dick / speech-826937 | 330 | 1 | 330 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/06-speech-826937-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/06-speech-826937-after.json) |
| Kerry O'Brien / speech-771520 | 22,284 | 5 | 4,673 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/07-speech-771520-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/07-speech-771520-after.json) |
| Susan McDonald / speech-830006 | 5,849 | 29 | 238 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/08-speech-830006-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/08-speech-830006-after.json) |
| Barnaby Joyce / speech-818002 | 21,639 | 11 | 5,029 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/09-speech-818002-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/09-speech-818002-after.json) |
| Alex Antic / speech-1194485 | 619 | 2 | 498 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/10-speech-1194485-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/10-speech-1194485-after.json) |
| Mark Bishop / speech-776965 | 2,630 | 4 | 829 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/11-speech-776965-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/11-speech-776965-after.json) |
| Eric Abetz / speech-810670 | 711 | 2 | 255 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/12-speech-810670-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/12-speech-810670-after.json) |
| Claire Moore / speech-790796 | 7,448 | 22 | 249 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/13-speech-790796-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/13-speech-790796-after.json) |
| Chris Evans / speech-802567 | 47,256 | 9 | 8,698 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/14-speech-802567-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/14-speech-802567-after.json) |
| Mark Arbib / speech-788542 | 3,808 | 2 | 229 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/15-speech-788542-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/15-speech-788542-after.json) |
| Karen Grogan / speech-1205293 | 32,222 | 35 | 126 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/16-speech-1205293-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/16-speech-1205293-after.json) |
| Richard Colbeck / speech-784746 | 3,285 | 2 | 272 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/17-speech-784746-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/17-speech-784746-after.json) |
| Zali Steggall / speech-830058 | 15,004 | 8 | 4,760 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/18-speech-830058-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/18-speech-830058-after.json) |
| Marise Payne / speech-809759 | 3,629 | 2 | 3,500 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/19-speech-809759-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/19-speech-809759-after.json) |
| Wendy Askew / speech-1200438 | 2,294 | 3 | 1,104 | [before](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/20-speech-1200438-before.json) / [after](/home/jake/opax-work/evidence/speaker-attribution-repair-20261012/samples/20-speech-1200438-after.json) |

## Downstream work before and after a go

| Consumer | Required work |
|---|---|
| Enrich Worker (`enrich/src/tick.ts`, `classify.ts`, `reconcile.ts`) | Hold Worker and platform enrichment before sync and keep generation held. Queue identities are RIDs, not slugs: cancel/retire old RID claims and batch reservations, resolve new RIDs from successful creation receipts, and queue the 131,484 new personal units with separate authorization to generate. A completed job is not reset by ordinary discovery. `/reconcile` handles only `hansard_hist`, so it cannot reconcile this OpenAustralia repair. Do not copy old machine fields or topic labels; preserve those on unchanged reuse and chair-only rows. |
| Person pages and counts (`portal/src/index.ts:1585`, `:1709`; `speech-attribution.js`) | Accept `speech-oa-…` slugs in person evidence and count distinct canonical, non-chair person units instead of old mixed rows. Retained interjections change the unit count; retain their `talktype` and make the count definition explicit. Rebuild facets/count caches by canonical collaborator and verified federal ID. |
| `parliamentarians.json` and `speakers.json` | Export from a reviewed DB repair or a manifest overlay: subtract retired resources, deduplicate GIDs, add new dated person units, and exclude chair/procedural units. The current untouched DB cannot produce repaired counts. Preserve roster/identity safety checks and canonical collaborator aliases; never take away an MP’s current identity because a chair turn loses a personal ID. Speaker export party-field exclusion is fixed in this branch. |
| Catalog and readers | Refresh the live KB catalog, corpus totals and any static search/crawl catalog after indexing. Net indexed-resource growth is 141,584. Update `isPublicSlug`, numeric-only person filters, `community-mcp.ts`, `voice-tools.ts`, mobile/document validators and record readers for the new slug family. Publish `redirects.json` and consume the passage crosswalk before retiring old resources. Include chair labels in resource rendering, without presenting them as personal speeches. |
| IndexNow (`portal/src/indexnow.ts:65`) | Regenerate changed person-page fingerprints and the crawl snapshot after count exports. The current eligible-path allowlist covers people, bills and divisions, not speech documents; speech submission requires an explicit allowlist/catalog change. `INDEXNOW_EXTRA_PATHS` accepts donors only and cannot carry this repair. Do not submit while canonical pages/redirects are absent. No journal/D1 writes occurred. |
| `CACHE_EPOCH` | Bump only with the orchestrator’s post-repair release, after redirects/readers and index validation. This invalidates resource bodies, search, person overviews, Ask answers and citation context. Bump monotonic `INDEXNOW_EPOCH_VERSION` alongside it; leave current values untouched during dry run. |
| DB references and refreshes | `oa_speech_provenance`, `speech_topics`, FTS, `contract_speech_links`, `bill_links`, bill speech exports, nightly reconciliation, bulk-sync checkpoints and text/speaker patch queues still refer to numeric speech IDs/old slugs. A reviewed DB repair or durable overlay must map them to canonical GIDs/units, rebuild text-derived links and stop refresh jobs recreating retired mixed slugs. Existing unrelated votes/person records do not need new person IDs. |

## Validation and exact command

121 focused tests passed, including the invented-name unclosed-paragraph/two-speaker/chair fixture, nested XML interjections, wrong legacy IDs, question/answer headings, no-network staging, duplicate-resource/GID handling, unchanged slug reuse, read-only DB bytes and chair-role patch ownership. The audit selfcheck passes. `git diff --check` passes. Staging validation verifies unique new GIDs/slugs, one collaborator per personal unit, chair labels with no personal ID/collaborator, no inherited topic/summary fields, and every destination’s presence in the plan or captured catalog.

Build command (offline):

```sh
/home/jake/opax/.venv/bin/python scripts/repair_speaker_attribution.py build \
  --output /home/jake/opax-work/evidence/speaker-attribution-repair-20261012
```

Exact re-sync command on an orchestrator go, **after** publishing compatible readers/redirects, holding all enrichment and reviewing the nine identity conflicts:

```sh
/home/jake/opax/.venv/bin/python /home/jake/opax-work/wt/speaker-attribution-repair/scripts/repair_speaker_attribution.py sync \
  --output /home/jake/opax-work/evidence/speaker-attribution-repair-20261012 \
  --env /home/jake/opax/.env \
  --apply \
  --approved-digest 99446101c021eec1b7bf7f5ea91405e7892db51ba4673af456970e5320b659f6 \
  --redirects-ready --enrichment-held --identity-conflicts-reviewed
```

The flags attest to prerequisites; they do not deploy redirects, stop Workers or resolve identities themselves. The digest binds the reviewed manifests, operations, corrected documents and identity-conflict ledger. Sync verifies all existing attribution and body preconditions before mutation, resumes from a local receipt, checks canonical conflicts on 409 and requires processed destinations before retirement. A changed live body, missing destination or unresolved review assertion stops the run. The 71 unresolved-source documents are never mutated. This command has **not** been run with `--apply`.
