# Federal bill text: OpenRouter configuration verification

Verified live on 13 September 2026 before the full-text ingestion run.

The KB generative and automatic summary models already use `openai-compatible` with `user_keys.openai_compat.url=https://openrouter.ai/api/v1` and `model_id=@preset/opax-pro`. The slot contains our OpenRouter key. No global model configuration was changed. Native provider key slots are empty.

The live OpenRouter preset designated version 2 selects `deepseek/deepseek-v4-pro-0813`, reasoning disabled. It allows only Together and DeepSeek hosts, preferring Together, with host failover enabled inside OpenRouter. Its descriptive text is stale; the designated version configuration is authoritative. No Progress/native-provider billing fallback was introduced.

Before this run, `/tasks` returned no automatic configurations and no running tasks. Completed sample labeler and summary tasks explicitly used OpenRouter. One old bulk labeler entry was failed, not running. The desktop had rebooted; no legacy label worker or enrichment process remained active.

## New topic labeller

Registered `opax-bill-text-topics`, task ID `1a0ddfcc-3b8a-457a-b769-7dca60ed0480`, with `apply=NEW` and `enabled=true`. No historical run was started. This applies to future processing events that match the filter, including a matching resource reprocessed later; it is not a historical backfill.

```json
{
  "on": 1,
  "filter": {
    "labels": ["kind/bill_text"],
    "labels_operator": 0,
    "field_types": ["t"],
    "fields": ["body"],
    "apply_to_agent_generated_fields": false
  },
  "llm": {
    "model": "openai-compatible",
    "provider": "openai_compat"
  }
}
```

The task carries a copy of the verified OpenRouter slot, including its key, model features and generation budget. Credentials are omitted here. It uses the existing 21 policy topics and a bill-specific classification prompt. Its only operation adds topic labels; it cannot rewrite the original body. No additional summary, synthetic-question, or LLM graph task was enabled. The existing automatic summary setting remains `simple` through OpenRouter.

Embedding (`multilingual-2024-05-06`, 1,024 dimensions), multilingual entity extraction and base relation extraction remain Progress processing services. They are separate from the configurable generative tasks. Routing generation through OpenRouter does not remove Progress ingestion/indexing charges. Classification may see a bounded model context on very large bills; missing topic labels do not establish missing source text.

The classification metadata accepted `kind=bill_text` and `bill_stage=first-reps` without requiring an enumerated labelset; the live labelsets collection is empty. No taxonomy schema was changed.

## Actual smoke evidence

The first real resource, `bill-text-au-federal-r7542-first-reps`, ID `81560128060346b89c587a090c37094b`, reached `PROCESSED` with no reported errors. Its original `body` field received computed topic labels `education` and `tax-budget`. This verifies the actual original-bill filter and generation path with the new task, beyond configuration acceptance. It contained 5,439 characters in two acquired source sections according to the ingestion receipt. Topic label coverage is separate from source completeness.

The setup script is idempotent for the same configuration, defaults to a read-only plan, rejects a non-OpenRouter KB slot, and only registers `NEW`. Native Gemini rollback and the old native-model setter now fail before loading credentials or making requests. Automatic recovery in the BYOK switcher restores only a previously verified OpenRouter configuration. Four focused provider/scope tests passed, along with Python syntax checks. Running the setup script again read back the existing enabled task without creating a duplicate.

Redacted live receipts are in `~/.cache/opax/mcp-research-20260913/`: `openrouter-config-before.json`, `openrouter-tasks-before.json`, `openrouter-preset-audit.json`, `openrouter-bill-labeler.json`, and `first-bill-label-smoke.json`.

## Documentation and source terms

- [Progress create DA agents](https://docs.rag.progress.cloud/docs/ingestion/how-to/create-da-agents) documents explicit task LLM selection and new-resource application.
- [Progress task parameters](https://docs.rag.progress.cloud/docs/develop/js-sdk/interfaces/DataAugmentationParameters) documents field/label filters, AND=0, and generated-field exclusion.
- [Official UI implementation](https://github.com/nuclia/frontend/blob/b4d4c3df17e397e7821e09c88196815accde6179/libs/common/src/lib/tasks-automation/task-forms/task-form.component.ts) serializes labels as `labelset/label` and field types using their short codes. The live API requires uppercase `NEW`; an initial lowercase request was rejected with 422 before any task was created.
- [Progress LLM configuration](https://docs.rag.progress.cloud/docs/develop/js-sdk/interfaces/LLMConfig) documents explicit model and key configuration.
- [OpenRouter presets](https://openrouter.ai/docs/guides/features/presets) explains designated preset configuration.

Do not attach a blanket CC BY licence to parliamentary bills, explanatory memoranda and library digests. The existing source scope recorded Parliament's general CC BY-NC-ND terms separately from Federal Register CC BY terms. The Parliament terms endpoint returned 403 during this fresh check, so a current bill-specific unrestricted republication licence was not independently established. The new ingestion metadata appropriately says source-site terms apply rather than asserting CC BY. Preserve source/version links and original wording; this is a provenance finding, not a legal conclusion or a new approval requirement. Source owner terms: [Parliament](https://www.aph.gov.au/Help/Disclaimer_Privacy_Copyright), [Federal Register](https://www.legislation.gov.au/terms-of-use). AustLII's [Commonwealth bills collection notice](https://classic.austlii.edu.au/au/legis/cth/bill/) is its own permission-based publication notice, not a transferable licence for Opax.
