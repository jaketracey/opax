# OPAX → Progress Agentic RAG migration

Status: **provisioned and smoke-tested end-to-end; bulk load pending cost sign-off.**
KB `opax` (`d33c0a87-98cb-4169-b0d2-ff9b75573fb7`, account `7b5c9761…`) is live with a
25-speech sample; the portal Worker serves grounded, cited answers off it. The
`ray-test` KB was deleted 2026-09-01. No enrichment (DA) task is registered anywhere —
gated on the cost sign-offs in §Costs. Branch: `worktree-arag-migration`.

**Models (updated 2026-09-01 evening — BYOK LIVE, provider-pinned):**
`generative_model` and `summary_model` are `openai-compatible` → OpenRouter →
model_id **`@preset/opax`** (an OpenRouter dashboard preset:
`deepseek/deepseek-v4-flash-0731`, provider routing only=[DeepSeek]).
Unpinned, OpenRouter served the model from 17 third-party hosts — mostly fp8
quants, at least one fp4 — so the pin buys full-precision first-party serving
at $0.44/$1.32 per 1M (~$0.008/ask, ~12K asks per $100). Routing policy lives
in the OpenRouter preset (dashboard edit, no KB touch): switch the preset's
`only` to `order` if fallback-on-outage is preferred over strict pinning
(strict = asks fail during a DeepSeek outage). generation_config 1600 max out
/ 120k max in.
Applied via `scripts/arag_byok_openrouter.py`; **rollback is one command**
(`--rollback` restores the previously pinned `gemini-2.5-flash-lite` and
clears the key). Verified in production: ~13s cited /ask, 20 sources/11 cited.
The OpenRouter key lives in `.env` (gitignored) and platform-side in the KB
config — it transited a chat transcript on setup, so rotate or spend-cap it.
OPEN QUESTION with a live experiment attached: watch whether ARAG platform
token burn for /ask drops to ~zero on the account dashboard — that answers
whether BYOK generation is exempt from platform billing. CAVEAT when reading
the dashboard: the Keep-asking follow-up generator (`/api/followups`, added
2026-09-01 evening) deliberately runs on platform-side `gemini-2.5-flash-lite`
per-request override (BYOK DeepSeek 412s structured output and burns its
whole output cap on reasoning) — so small nonzero platform-token numbers are
EXPECTED from follow-ups; only the main /ask line should flatline. Embeddings remain
platform `multilingual-2024-05-06`. (The old gemini upgrade ladder is
superseded while BYOK holds — any OpenRouter model id is now a config edit.)

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

**BYOK input (2026-09-01, verified read-only against the live KB):** ARAG
supports bring-your-own-key via `PATCH /api/v1/kb/{kb}/configuration`
`{"user_keys": {...}}` (currently null on the opax KB). Provider groups
include `palm` (own Gemini key — the KB is pinned to gemini-2.5-flash-lite),
`openai`, `anthropic`, `azure_openai`, `mistral`, `hf_llm`/`hf_embedding`,
and `openai_compat` (any OpenAI-compatible endpoint, incl. self-hosted vLLM —
relevant to the enrichment pass). With a own Gemini key, generation should
bill at Google list price to our own account instead of ~$0.008/ARAG-token
with undisclosed multipliers. CAVEATS before relying on it: (1) confirm with
Progress that BYOK generation is exempt from platform-token billing — a
markup on top of our own key would be the worst of both worlds; (2) BYOK
covers generative calls only, not ingest/processing, so the §1 bulk-load
question stands; (3) any stored key must be API-restricted with a spend cap
(it lives in the KB config). Set via `scripts/arag_set_models.py`'s endpoint.

**Prepared switch (2026-09-01, NOT applied — awaiting the OpenRouter key in
`.env`):** `scripts/arag_byok_openrouter.py` moves generative+summary to
`openai-compatible` via OpenRouter with `deepseek/deepseek-v4-flash`
($0.081/$0.162 per 1M, 1M context — flash-lite territory, billed direct),
generation_config sized for cited answers (1600 out / 120k in), with a live
/ask smoke test and automatic rollback to gemini-2.5-flash-lite on failure
(also `--rollback`). Run at a quiet moment — the KB serves production /ask.
If this lands, the §Models upgrade ladder above is partly superseded.

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

**BYOK re-pricing (2026-09-01, deepseek-v4-flash via OpenRouter at
$0.081/$0.162 per 1M):** portal asks ≈ $0.0014 each (~70K answers per $100);
speeches-only enrichment pass ≈ **$68** (fits a $100-capped key); whole
filtered corpus incl. legal ≈ $270. Generation is now on our own dime at list
price — the undisclosed-multiplier ARAG-token line applies (pending the
dashboard experiment) only to ingest/processing.

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

## Public portal v2 (2026-09-01 — design fan-out, deployed)

Four parallel expert passes (civic design lead, research-tools UX, WCAG 2.1 AA
audit, 3D-graph port) merged into the shipped portal, reviewed (5-finder code
review; all clear-cut findings fixed) and deployed to opax.com.au:

- **Identity "The record, in daylight":** paper-white surface (dark via
  prefers-color-scheme), Literata for record content / Public Sans for UI,
  single Hansard-bronze accent with a usage rule, ledger-rule motif, party
  dots always paired with text labels. WCAG AA verified computationally.
- **Ask, Cited:** cited vs also-retrieved split (Worker-computed `cited` flag),
  suggestion chips, share links (labelled re-runs), BibTeX/RIS/CSV export,
  live corpus meter, legal/news scope checkbox.
- **Hansard Workbench:** server-side speaker/party/state/year filters
  (`origin_collaborator` / `label` / `created` filter_expression props,
  verified against the live KB), guided card, permalinks, exports with
  reproducibility headers.
- **Document pages:** `#/doc/{slug}` canonical citable permalinks; cite panel
  (AGLC-guidance/APA/BibTeX/RIS); openaustralia concatenation caveat per-doc.
- **Money Map:** corpuskit 3D engine ported to `portal/graph/` (vanilla
  adapter, analytic picking, label occlusion fix); 250 top donors + 11
  parties from parli.db (`scripts/export_money_graph.py`, exclusions
  documented in `public/graph/money.json` meta).
- **Methods + corpus.json manifest:** the citable dataset version, stamped on
  answers and exports. Colophon/About/Methods all render from the manifest —
  update `corpus.json` when the bulk load or a re-sync completes.
- Citation `[n]` markers deliberately render as plain text: the platform's
  answer-marker → retrieval-result mapping is undocumented; do not wire jump
  buttons until verified (misattribution risk).

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

## Enrichment sample (2026-09-01 evening — COMPLETE, verified)

The 2,000-speech topic-labeler sample (task 38714b7c, `scripts/arag_enrich.py`,
BYOK on the OpenRouter key) ran to completion. Facet probes confirm the labels
work as `/find` filter facets: `{prop:'label', labelset:'topic', label:...}`
returns topically-correct hits for all probed labels (gambling → Dutton 2004,
immigration → Ruddock, financial-services → Costello, etc.). Per-doc
classification metadata doesn't surface under usermetadata on the sampled
resources (labels live at the field level the filter sees) — fine for the
facet use case. NEXT (gated on user + load completion):
`python3 scripts/arag_enrich.py start-full` labels the whole speech corpus
(~$70-100 at quant pricing), unlocking topic facets in the Workbench and
donation-industry ↔ speech-topic joins.

## Summaries sample (2026-09-01 evening — COMPLETE, live)

The 500-speech summary sample (ask-task 84482f3f, BYOK) completed. The
generated summary lands as the **text field `da-summary-t-body`** on each
resource (NOT the basic `summary` attribute — that stays empty). The Worker's
`/api/resource` surfaces it as `summary` (the `body`/`body-N` reassembly
filter already excludes it) and doc pages render it as an "In brief" block
with a machine-summary disclosure. Sampled rids re-extracted from the task
record (`/task/{id}/inspect` → request.parameters.filter.rids) into
`scripts/harness_runs/enrich_sample_rids.json`. NEXT (gated on user + load
completion): `start-full-summaries` (~$45).

## Speaker-filtered asks need the provenance turn (INVARIANT)

Hansard passages are first-person with no in-text attribution, so a
speaker-filtered ask ("What did X say about Y?") reads to the generative
model as unattributed text and it refuses ("Not enough data") even with 20
on-target sources. `apiAsk` therefore injects one USER `context` turn naming
the speaker whenever `body.speaker` is set (A/B verified upstream and on
prod: Wilkie/gambling refusal → 4-citation answer). The note shares the
platform's 24-turn context budget with chat turns. Do not remove it as
"redundant" — the filter alone does not tell the model who is speaking.

## Post-enrichment roadmap (planned 2026-09-01, gated on full labeller + summaries passes)

Verified primitives (probed live against the 2K-label sample):
- `/catalog?faceted=/classification.labels/topic&page_size=0` returns live
  per-topic counts. VERIFIED.
- Facets combine with `filters` (probed `/classification.labels/party/Labor`
  → Labor-only topic counts). VERIFIED. Date-range + state slices should
  follow the same shape — probe before building the timeline views.
- Topic labels work as retrieval filters on /find and /ask (verified in the
  sample eval); summaries live in `da-summary-t-body` (surfaced on doc pages).
- NOT yet verified: speaker facets (origin.collaborators may not be
  facetable) — top-speakers-per-topic may need client-side aggregation over
  /find pages or a static export.

Views/tools to build once the full passes run, in value order:

1. **Topic filter in the ask + search popovers** — DONE 2026-09-01 (deployed
   e92a49e0): Topic selects in both popovers, allowlisted topic label clause
   in filterExpression, deep links round-trip. Coverage grows with the pass.
2. **Topic pages** — DONE 2026-09-01 (deployed 48e8f601): /api/topic/{slug}
   + /api/topics (faceted catalog, 10-min cache), #/subject/topic pages with
   honest still-labelling copy, party split, money pairing, Topics A-Z index
   in Explore/drawer. Multi-label caveat: never sum facet counts; the bare
   labelset filter total is the labelled denominator.
3. **Party × topic matrix** — DONE 2026-09-01 (deployed d3a10117): Explore
   card + game dialog (matrix.js), /api/matrix with catalog calls batched in
   fives — Workers cap simultaneous connections at 6 and count unread
   bodies, so wide Promise.all fans die in production only ("Response
   closed due to connection limit"). Remember this for any future fan-out
   endpoint.
4. **Words per dollar** — DONE 2026-09-01 (deployed 9b9fb01c): fifth
   Explore view (wordsdollars.js), donations beside debate share per party
   for the 8 industry→topic mappings, built entirely from /api/matrix +
   money.json. Shares use the topic-total denominator (matrix convention).
5. **Then vs now** — DONE 2026-09-02 (deployed 8b98d2b3): sixth Explore
   view (thenvsnow.js), sequential era-filtered asks with honest
   loading-gap copy for thin eras and reader-owned consistency judgment.
6. **Topic digests** — DONE 2026-09-02: "The latest, in brief" on every
   topic page, stitched client-side from /api/resource summaries of the
   newest labelled speeches; drops nulls, guards stale navigation.
7. **Time machine + quiz upgrades** — DONE 2026-09-02 (worktree, deploy
   pending): optional topic lens on the time machine (module-local TOPICS
   mirror; one topic-phrase+label-filter probe replaces the curated
   queries when active, default all-topics path byte-identical; two-cause
   honest empty/thin copy since archive load AND labelling both run);
   quiz gains two live templates off /api/matrix (topic-party-share,
   topic-most-labelled) with clear-leader fairness guards, "labelled so
   far" hedging in prompt and reveal, receipts linking to topic pages
   (validQuestion link allowlist extended). Verified live: 200/200 seeds
   fire, 28/30 rounds carry a topic question.
8. **Doc pages** — DONE 2026-09-02 (worktree, deploy pending): topic
   chips under the byline linking to topic pages. Worker probe confirmed
   topic labels live at resource-level `computedmetadata.
   field_classifications[].classifications` (labelset `topic`, on the
   `body` text field — NOT usermetadata, which holds only the sync-time
   labelsets); apiResource now returns them as `topics: string[]`
   (multi-label, [] until the pass reaches a doc — chips render nothing).
   "More on this topic that week" (label+created) not built — the chips →
   topic page → filtered search path covers it; revisit if wanted.

Sequencing: full labeller (~$70-100) unlocks 1-5 and 7-8; full summaries
(~$45) unlocks 6 and enriches 2/5. Items 3-6 warrant one probe each before
building (facet shape under date ranges; ask latency under tight filters).

**STARTED 2026-09-01 (Jake: "go on both", mid-load in parallel):**
labeller task `e0f57668` (opax-topics), summaries task `38f2747c`
(opax-summaries), both apply=ALL so they cover the ~174K loaded speeches
AND every new arrival as the bulk load continues — nothing waits, nothing
is missed. Both carry the OpenRouter key per-task (never platform compute).
The scripts' load-completion gates now yield to `OPAX_ENRICH_NOW=1`
(the env check short-circuits BEFORE load_still_running(), which matters:
that function shells out to ssh, and ssh eats the stdin that the confirm
prompt needs). Track with `python3 scripts/arag_enrich.py status`; build
the roadmap views as label coverage grows (facet counts show progress).

## Open items

- ~~Speaker filter exact-match only~~ RESOLVED 2026-09-01: speakers.json
  (2,063 names+counts, exported with the sync's own normalize_speaker so
  every name is a valid collaborator value) + client resolveSpeaker():
  casefix, albo/scomo nicknames, unique-surname wins, dominant surname only
  at 5x the runner-up, ambiguous left as typed. Residual: ~957 bare-surname
  collaborator values from surname-only Hansard prints split some people
  across two names ("Hume" vs "Jane Hume") — a dedupe would need the
  members table, which is dirty; left alone deliberately.
- If/when the legal push is approved: raise `portal/public/corpus.json`
  `expected_resources` to include the legal docs — the front-page corpus meter
  compares it against the KB's total resource count and will otherwise hide
  while speeches are still incomplete.

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
