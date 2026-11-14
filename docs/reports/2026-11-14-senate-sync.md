# Senate backfill sync and spend review, 14 November 2026

The retained normal speech sync measured **8.94 to 18.61 successful speech
acknowledgements per second with 10 workers**. The backfill now reserves at
**8.9 documents/second**, rounded down from the bulk run, replacing the
unmeasured two-document allowance. Time supports the existing maximum of
**10 days/night within 1,200 seconds**. The default remains **2 days/night**
because note-1 explicitly requires a conservative default when ingestion
has a cost. Paid enrichment is quantified below; Progress processing and
the account's index overage terms remain unresolved. This is a spending
constraint, not a throughput constraint.

No production, KB or D1 writes, remote-host connections or source fetches
were made for this follow-up. Local estimation used the existing ten-day
scratch cohort with `nice -n 10` and a load guard. Only the public Progress
and Cloudflare pricing pages were consulted online.

## Retained normal-sync measurements

The [timing receipt](2026-11-14-senate-sync-evidence.json) contains source
paths, SHA-256 digests, counter extracts and calculations. These are actual
retained sync runs, not a pool-size-times-assumed-latency bound.

| Run | Speech counter before / after | Successful speech delta | Sync seconds | Speech acknowledgements/second | Whole-stage seconds / rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop bulk, 2 September | 518,685 / 595,590 | 76,905 | 8,606 | 8.936 | 8,613 / 8.929 |
| Desktop normal nightly, 28 September | 598,416 / 600,482 | 2,066 | 111 | 18.613 | 121 / 17.074 |

The bulk run is retained in
`~/.cache/autoresearch/pipeline/sync_after_backfill.log`. It also acknowledged
318 news articles. Dividing only the speech delta by the full elapsed time
understates total document throughput and supplies the slower rate used in
the budget. Its calendar date follows the retained log modification date;
embedded start/end times are 18:38:59 and 21:02:32. The normal nightly's
`arag_sync.log` pairs with dated `daily.log` entries at 21:48:12 and 21:50:13.
Its 10 seconds of dedupe preparation explain the 111/121-second difference.

`parli/ingest/arag_sync.py` uses `WORKERS=10`, 200-row batches and a
`ThreadPoolExecutor`. The versions preceding both retained runs also use
10 workers, recorded by commit in the receipt. `_push_one` calls
`KbClient.create_resource`, which posts the mapped text and metadata to
`/api/v1/kb/{kb_id}/resources`. A 409 existing slug counts as done, so these
are successful acknowledgements, not independently verified new creations.
Neither run had failed speech IDs at start or finish. These timings do not
measure asynchronous indexing or later enrichment completion. Backpressure
can slow future nights; no November latency or indexing rate is invented.

The newer evidence does not yield a speech throughput measurement:

* `origin/nightly-status:status.json` at `329333128` points to the exact
  14 November refresh commit `3a5d46667`. Its **+19 are press releases**,
  with zero new speech resources. The status has whole-night timestamps,
  no sync duration, and a failed 75-minute portal-test blame. Dividing 19
  by whole-night runtime would measure unrelated work.
* The preceding corpus receipt contains 410 new speech resources but no
  corresponding sync elapsed time. A count alone gives no rate.
* The cached 11 October VM log has two sync stage entries with `0s` and no
  speech counts. The cached manual sync has unchanged speech counters and
  zero elapsed seconds. Neither is a non-empty timing sample.
* The October historic pilot's four-worker publisher is a different path.
  Its timing is not substituted for the normal 10-worker speech sync.

## Spend estimate for Jake

The [offline cost receipt](2026-11-14-senate-spend.json) was generated from
the **same 2,556 eligible payloads** in the ten-day rehearsal. Normal sync's
selection, dedupe and mapper reproduce the original 10,078,521 payload
bytes exactly. Source text is 6,446,303 UTF-8 bytes. No new sitting-day XML
was parsed. The existing `enrich/scripts/federal_backfill_cost.ts` applies
the real prompts, clipping and `neuronsFor` prices without SDK or network
calls. Its hard-coded October price date is retained in the raw receipt;
the same model and neuron prices were verified on 14 November.

| Scenario | Eligible KB documents | Payload | Gross first-pass model cost | With 5% primary retries + 1% escalation | Estimated added index / list-price monthly overage |
| --- | ---: | ---: | ---: | ---: | ---: |
| Requested 100k-document scenario | 100,000 | 394.3 MB | US$30.63 | US$33.31 | 4.945 GB / US$19.78 per month |
| Extrapolated rehearsal mix over 284 days | about 72,590 | 286.2 MB | US$22.24 | US$24.18 | 3.590 GB / US$14.36 per month |

The rehearsal inserted 353.5 rows/day but only 255.6/day pass normal KB
publication filters. Thus `284 x about 350` describes about 100k SQLite
rows; it need not mean 100k KB documents. The 100k-document scenario is
retained as the requested larger planning case. These are extrapolations
from a ten-day sample, not a whole-manifest document census.

There are three distinct billing components:

1. **KB processing, including embeddings:** the sync posts populated text
   fields and does not call a separate embedding provider. The retained
   configuration report records Progress multilingual embeddings
   (`multilingual-2024-05-06`, 1,024 dimensions), entity extraction and base
   relation extraction as Progress services. The public rate is
   **US$0.008 per Progress platform token**, with consumption proportional
   to processed data. These are platform billing tokens, not LLM input
   tokens. No retained measurement converts Senate bytes/documents to
   those tokens. The processing estimate therefore remains
   `US$0.008 x billable platform tokens`, **unquantified**. Routing generation
   elsewhere does not remove this charge.
2. **Indexed storage:** the public overage is **500 platform tokens per
   extra GB/month**, or **US$4/GB-month**. The retained October historic
   pilot note records +98.9 MB for 2,000 documents including briefs, about
   49.45 decimal KB/document. Applying that analogy gives the table's
   monthly amounts. This is neither a Senate index measurement nor a
   bound. The planning notes record a prepaid Pro plan with reseller
   overage terms still unknown. Published Pro capacity is 25 GB or 80k
   resources, with 10k platform tokens/month included; no account quota
   headroom is assumed. Public promotional offers are not treated as this
   account's entitlement.
3. **Normal enrichment:** `opax-enrich` discovers these speech resources
   and admits summary/topic tasks; one Qwen call normally supplies both.
   The estimator uses 620 output tokens, the existing bake-off mean,
   and the actual clipped sample prompts. At current prices it is about
   **US$0.000306/document**, or US$0.000333 with the retry scenario, before
   the shared 10k-neuron daily free allocation. Output lengths and retries
   are estimates. The existing **US$40 cumulative model ceiling** remains
   enforced across nights; it excludes Progress processing/storage and
   D1/Workers platform charges. An unconstrained every-call-max-output
   scenario would cost US$143.94 for 100k documents, so the ceiling can
   leave enrichment held rather than complete. It is not an all-in spend
   cap.

The later [21 September configuration receipt](../operations/2026-09-21-corpus-refresh.md)
records the KB's no-generation summary provider and disabled automatic
enrichment tasks, superseding the older bill-import OpenRouter summary
configuration. The present path relies on the normal Workers AI
enrichment above; no paid OpenRouter task is enabled by this change. No
current remote configuration was queried or changed.

The estimate to take to Jake is therefore **about US$31 to US$33 in model
work plus about US$20/month of index overage for 100k documents, with KB
processing still to price**. Shared allowances and the contract may reduce
the bill; they cannot be assumed to make it free. D1 and Workers platform
usage also depend on shared quotas, retries and admission transactions and
are outside these figures. The required missing evidence is the contracted
index-overage rate and a Progress processing-token delta per MB, together
with remaining included quota. No behaviour is changed on an assumed
zero-cost contract.

Sources: [Progress public pricing](https://www.progress.com/agentic-rag/pricing),
[Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/),
the repository's [Progress processing configuration report](../operations/2026-09-13-bill-text-openrouter.md),
and the [existing enrichment ceiling](2026-10-13-federal-hansard-backfill-fix.md).
The cost receipt records hashes and paths for the retained October planning
and pilot memory notes; those private files are not committed.

## Cap, budget and completion dates

The largest rehearsed day has 614 long XML turns reserved before loader
exclusions. Its measured-rate publication reservation is `614 / 8.9 =
68.99 seconds`. Allow 1.184 seconds for a fresh fetch, 0.823 seconds for
peak local day work, a fixed 120 seconds for normal sync preparation, and
the existing 60-second commit margin:

* Two peak days: `120 + 60 + 2 x (68.99 + 1.184 + 0.823)` = **322 seconds**.
* Ten peak days: the same expression with ten days = **890 seconds**,
  about **14.8 minutes**. The ten-day sample mix models about 8.2 minutes.

The measured throughput supports the **10-day maximum** without raising it.
`OPAX_SENATE_BACKFILL_BUDGET_SECONDS=1200` remains configurable downwards;
the stage deducts measured-rate publication reserves from its local
deadline and can stop before the day cap. New IDs still enter the normal
speech outbox for the following sync. There is no second publisher or
new patch queue. Each stage receipt now records the throughput and source
used for its budget. Identity holds, refusal stops, citations, coverage
warnings and the automatic coverage line remain unchanged.

Assuming merge on 14 November and first catch-up night on 15 November:

| Setting | 284-day nights | Last insertion | Following normal sync |
| --- | ---: | --- | --- |
| **Default retained for spending: 2/day** | 142 | **5 April 2027** | 6 April 2027 |
| **Time-supported option: 10/day** | 29 | **13 December 2026** | 14 December 2026 |

If the newer owner DB already holds the five early-2019 days, the counts
are 140 or 28 nights, with insertion on 3 April or 12 December respectively.
Dates shift with the actual first night, missed nights, source refusals or
holds. They are capacity estimates, not promises of full indexing or
enrichment completion. The coverage copy remains:
**“Senate Hansard for 2014 to 2018 is being added.”**

## Follow-up validation

The ingest, identity and coverage gate passed **255 tests and 23 subtests**;
the focused HTTP gate passed **12 tests**. `cd portal && npx tsc --noEmit`,
`node scripts/stamp_assets.mjs --check`, shell syntax and `git diff --check`
passed. New regressions bind publication reservations to the retained bulk
measurement and exercise stopping, resuming and zero repeat inserts with a
10-day cap. The unchanged default remains covered by the nightly wiring
test. No portal code, copy or generated assets changed in this follow-up;
the original implementation's **4,957 passing npm tests at concurrency 4**
remain its portal gate, with no full npm rerun for these backend/report
changes.
