# OPAX → Progress Agentic RAG migration

Status: **provisioned and smoke-tested end-to-end; bulk load pending cost sign-off.**
KB `opax` (`d33c0a87-98cb-4169-b0d2-ff9b75573fb7`, account `7b5c9761…`) is live with a
25-speech sample; the portal Worker serves grounded, cited answers off it. The
`ray-test` KB was deleted 2026-09-01. No enrichment (DA) task is registered anywhere —
gated on the cost sign-offs in §Costs. Branch: `worktree-arag-migration`.

**Models (pinned 2026-09-01, cheapest tier):** `generative_model` and `summary_model`
are `gemini-2.5-flash-lite` — the cheapest of the KB's 71 generative options
($0.10/$0.40 per 1M provider tokens); grounded cited answering keeps lite-tier models
honest, verified on the sample. Upgrade ladder if sample-eval quality demands:
`chatgpt-5-nano` → `gemini-3.1-flash-lite` → `gemini-3.6-flash`
(`scripts/arag_set_models.py <model-id>`). Embeddings: platform default
`multilingual-2024-05-06` (no per-query LLM cost). NOTE: Progress bills in
**Agentic RAG tokens** (~$0.008/token past the monthly allowance) with undisclosed
per-model multipliers — the step-4 sample measures the real burn.

**Corpus filter (2026-09-01):** speeches only migrate from **1993-03-13** (the
election that seated the longest-serving current federal MP — nothing predates any
currently serving parliamentarian; the members table is too dirty to derive this
per-member) and only if **≥200 chars** (drops "business start"-style procedural
fragments). Kept: **627,061 speeches / 2.22 GB** — halves the speech corpus.
Override: `--since`. Legal documents are not date-filtered (in-force law is old).

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
| speeches (full) | 1,187,050 | 4.40 GB (752.7M words) | 3.7 KB | ~1.05 B |
| **speeches (≥1993, ≥200 chars — what migrates)** | **627,061** | **2.22 GB** | 3.5 KB | **~0.56 B** |
| legal_documents | 232,560 | 9.21 GB | 39.6 KB | ~2.30 B |
| news_articles | 4,028 | small | — | negligible |
| **Total migrating (with legal)** | **864 K docs** | **11.4 GB** | | **~2.9 B** |
| **Total migrating (speeches-only phase 1)** | **631 K docs** | **2.2 GB** | | **~0.56 B** |

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

| Scope (post-filter corpus) | Input | Output | Flash std | Flash batch | Lite batch |
|---|---:|---:|---:|---:|---:|
| Speeches (627K, ≥1993) | 0.65 B | 94 M | $430 | **$215** | $51 |
| Legal only | 2.34 B | 70 M | $875 | **$438** | $131 |
| Whole filtered corpus | 3.0 B | 164 M | $1,310 | **$654** | $182 |

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

## Done 2026-09-01

- `ray-test` KB deleted (account `7b5c9761…`, which also holds `noicework`).
- `opax` KB created, SOWNER token minted (`.env`), zero DA tasks.
- Models pinned to `gemini-2.5-flash-lite`.
- 25-speech smoke push (4s, 0 failed) → `/find` + cited `/ask` verified through the
  portal Worker locally (`wrangler dev`), including origin/extra serialization and
  the split-body document viewer.

## Corpus QA pass (2026-09-01, three parallel agents — measured, validated live)

**Final migrating corpus: 518,685 speeches (1.67 GB) + 3,592 news articles.**
From the 627K post-date-filter set: dedupe −86.5K (drop `wragge_xml` wholesale —
genuine 1998-2005 federal House Hansard but 94% redundant inside zenodo; drop
openaustralia House rows on zenodo sitting dates — zenodo is House-ONLY, so oa's
20.6K Senate rows are the corpus's only Senate chamber coverage and are kept;
window-dedupe exact (date, speaker, text) — 17.1K rows, almost all committee
transcripts double-ingested on 8 dates), junk −~32K via predicates P1-P7 in
`arag_sync.py` (chair/procedural rows, division roll-calls, day indexes, TOC
documents, gallery welcomes, clerk records). Text cleanup at load: HTML-entity
unescape, leading ':'/'—' artifacts, NSW ALL-CAPS header dupes, committee turns
get their `[topic]` prepended as searchable body. Speaker names normalized
per-source via `parli/ingest/speaker_names.py` (57/57 sampled formats pass);
party labels via a 15-value canonical whitelist (office strings → no label).
Lesson that cost an hour: `topic IN (...)` with NULL topic poisons `NOT(...)`
chains in SQLite — every nullable column in an exclusion predicate needs
COALESCE (zenodo's 305K rows silently vanished until fixed).
Not fixed (documented): openaustralia's ~23% missing-space concatenation
("toSenator Abetz") — needs upstream re-clean; corrupt members linkage (151
member rows, 35K speeches) — don't trust members-derived facts for those.

## Invariants

- **Slugs are citation URLs.** `speech-{id}` / `legal-{id}` / `news-{id}` slugs are
  the public permalinks academics cite (`/#/doc/speech-123`, `/api/resource/...`).
  Any re-sync, re-import or schema change MUST preserve parli.db primary keys —
  a renumbered corpus breaks every footnote that ever cited us.

## Open items

- Step-4 sample (~2K docs) → measure Agentic RAG token burn/resource, eval
  flash-lite answer quality → the two §Costs sign-offs.
- news_articles text column name (scan errored on content/body/text — check schema
  before syncing that table).
- The members table is dirty (current members linked to 1901 records, e.g. Susan
  McDonald `entered_house=1901-05-09`; Bob Katter carries his father's 1967 entry).
  Doesn't block the KB migration (cutoff is pinned, not derived) but it corrupts
  any speaker-linked analytics on the current site too.
- Decide the fate of the 30 Next.js investigation pages (park, or regenerate the
  top handful as static pages over exported JSON).
- ~~Portal deploy + opax.com.au DNS cutover~~ **DONE 2026-09-01**: Worker
  `opax-portal` deployed (account 4597145…, workers.dev + custom domains
  opax.com.au / www). The old EC2 A record and a stale Vercel CNAME were deleted
  from the zone (google-site-verification TXT kept). Rollback = re-point DNS.
  The site is live on the 25-speech sample until the bulk load runs.
