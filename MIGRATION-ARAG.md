# OPAX → Progress Agentic RAG migration

Status: **built, not yet executed at scale.** No knowledge box has been bulk-loaded and
no enrichment (DA) task is registered anywhere — both are gated on the cost sign-offs
in §Costs. Branch: `worktree-arag-migration`.

## Target architecture

```
Browser ──> Cloudflare Worker (portal/)  ──> Agentic RAG KB  (/find, /ask, /resources)
             ├── static FE (public/)          aws-ap-southeast-2-1
             └── /api/* proxy (KB token       1.19M speeches + 232K legal docs
                 held server-side)
```

Retired at cutover: the FastAPI backend, the Next.js app, self-hosted embeddings +
FTS5, the EC2 box. Structured analytics (votes, donations, contracts, disconnect
scores) are **not** in scope of the KB — they stay relational; the investigation
pages that depend on them are parked until a later phase (or rebuilt as portal
pages over exported JSON).

## What's in this branch

| Piece | Path | State |
|---|---|---|
| ARAG client (account + KB planes, backpressure-aware) | `parli/arag.py` | done |
| KB provisioning / admin CLI (create, delete-kb, tasks) | `scripts/arag_provision.py` | done, needs `ARAG_ACCOUNT` |
| Corpus sync (resumable, cost-guarded, checkpointed) | `parli/ingest/arag_sync.py` | done, smoke-test pending |
| Portal: Worker API proxy + static FE | `portal/` | done, typechecks (`npm run check`) |
| Transition bridge: `ARAG_SEARCH=1` flag on the old FastAPI | `parli/arag_search.py`, `parli/api.py` | done (optional; lets opax.com.au trial ARAG before the portal cutover) |

Credentials in `.env` (never committed): `ARAG_ZONE`, `ARAG_NUA_KEY` (account plane),
and after provisioning `ARAG_KB_ID` + `ARAG_KB_TOKEN` (data plane). The portal Worker
gets `ARAG_KB_ID` as a var and `ARAG_KB_TOKEN` via `wrangler secret put`.

## The corpus (measured 2026-09-01, parli.db = 21.2 GB on the WSL box)

| Table | Rows | Text | Avg/doc | Est. tokens |
|---|---:|---:|---:|---:|
| speeches | 1,187,050 | 4.40 GB (752.7M words) | 3.7 KB | ~1.05 B |
| legal_documents | 232,560 | 9.21 GB | 39.6 KB | ~2.30 B |
| news_articles | 4,028 | small | — | negligible |
| **Total migrating** | **1.42 M docs** | **13.6 GB** | | **~3.35 B** |

Staying relational: votes 304K · donations 199K · grants 230K · contracts 15.8K ·
bills 5.3K · members 2,415 · speech_topics 2.98M · lobbyists/meetings/interests.

## Runbook

All corpus steps run on the WSL box (`desktop`), which holds `parli.db`.

1. `uv run python scripts/arag_provision.py list-kbs` — verify account binding.
2. `uv run python scripts/arag_provision.py create` — creates the `opax` KB, mints a
   SOWNER token, writes both into `.env`. Registers **zero** DA tasks by design.
3. Smoke test: `uv run python -m parli.ingest.arag_sync --tables speeches --limit 25`
   then check `/find` + `/ask` through `portal` (`npm run dev`, `.dev.vars` filled).
4. Sample eval: push ~2,000 mixed docs, judge retrieval quality + measure actual
   platform token burn per resource → extrapolate the full-push cost.
5. **GATE: full-push sign-off** (see Costs). Then:
   `uv run python -m parli.ingest.arag_sync --tables speeches,legal_documents,news_articles --full`
   Resumable: checkpoint in `~/.cache/autoresearch/arag_sync_state.json`; 429
   backpressure honoured automatically; `--retry-failed` mops up.
6. Portal deploy: `cd portal && npx wrangler secret put ARAG_KB_TOKEN && npx wrangler deploy`,
   then point opax.com.au DNS at the Worker.

## Costs — the two open sign-offs

### 1. ARAG platform ingest (blocks step 5)

Processing 13.6 GB / ~3.35B tokens through extraction + embedding consumes platform
token allowance, and 1.42M resources in one KB is ~1,000× the biggest KB on the
account today (VCCMHW: 1,115 resources / 403K paragraphs / 2.5 GB index). **Before
the full push, get from Progress:** per-token/per-GB processing cost on our plan, and
confirmation a KB at 1.4M resources / ~14M paragraphs is supported. The step-4 sample
gives the empirical per-resource burn. A cheaper phase-1 shape if the number is ugly:
speeches-only (4.4 GB), or speeches since 2000.

### 2. LLM analysis pass (separate ask: batch-classify the corpus)

Gemini 2.5 Flash, one pass over every doc (≈150-token prompt overhead; ≈150 output
tokens/speech, ≈300/legal doc). Current list prices per 1M tokens: Flash $0.30 in /
$2.50 out, Flash-Lite $0.10 / $0.40; Batch API is 50% off both.

| Scope | Input | Output | Flash std | Flash batch | Lite batch |
|---|---:|---:|---:|---:|---:|
| Speeches only | 1.23 B | 178 M | $814 | **$407** | $97 |
| Legal only | 2.34 B | 70 M | $875 | **$438** | $131 |
| Whole corpus | 3.57 B | 248 M | $1,691 | **$846** | $228 |

Recommendation: Batch API always (no urgency in a corpus pass); trial Flash-Lite on
a 1K-doc sample first — if quality holds for classification-shaped work, the whole
corpus is ~$228.

### Enrichment (DA tasks) — deferred, deliberately

Nothing registers or starts DA tasks in any code path here; `KbClient.start_task()`
exists but only `scripts/arag_provision.py` admin use reaches it. When approved, the
candidate set (run **sequentially** — labelers can't overlap): `labeler` mapping the
20 OPAX topics, `llm-graph` (MP ↔ company ↔ bill relations), `synthetic-questions`
for the portal's suggested asks. Each is an LLM pass over ~14M paragraphs — cost it
from the step-4 sample before enabling anything, and always pin
`parameters.llm.model` (unpinned tasks 200 then fail silently).

## Cutover / rollback

The old stack keeps running untouched through steps 1–5 (data flows one way,
parli.db → KB). Cutover is a DNS change to the Worker; rollback is pointing DNS
back. The `ARAG_SEARCH=1` env flag on FastAPI allows an A/B period where the
existing site serves ARAG answers without the new FE.

## Open items

- **ARAG_ACCOUNT UUID for the new NUA key** — the key provided 2026-09-01 is not
  scoped to the noice account (f2ac01e1…) nor progress-jay; need its account UUID
  (visible in the dashboard URL) before `create` / `delete-kb` work.
- **Delete the "ray test" KB** — not on the noice account (only `vccmhw` +
  `ncsr-demo` there); presumably on the new key's account:
  `uv run python scripts/arag_provision.py delete-kb <slug>` once ARAG_ACCOUNT is set.
- news_articles text column name (scan errored on content/body/text — check schema
  before syncing that table).
- Decide the fate of the 30 Next.js investigation pages (park, or regenerate the
  top handful as static pages over exported JSON).
