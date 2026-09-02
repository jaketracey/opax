# OPAX: Open Parliamentary Accountability eXchange

**Ask what Australian politicians actually said, see how they voted, and follow who funds them.**

[opax.com.au](https://opax.com.au)

---

**518,685 speeches** from five parliaments | **13,867 recorded divisions** | **199,233 donations classified by industry** | **6 standing investigations**

---

## What OPAX does

OPAX puts the parliamentary record in front of the reader and lets them question it. Every answer is written only from retrieved passages and cites them; if the record is thin, the answer says so.

- **Ask the record.** Grounded, cited answers over Hansard from the Commonwealth, New South Wales, Victoria, South Australia and Queensland, plus Senate committee hearings and news coverage. Filter by speaker, party, state, topic or years. Answers stream in as they are written.
- **Search.** Hybrid keyword and semantic search with the same filters, a per-search answer rail, and exports (CSV, BibTeX, RIS).
- **Encyclopedia.** An entry for every parliamentarian, party, donor and topic: quick facts, portrait, voting record, declared interests, expenses, and the money map isolated on that entity.
- **Money map.** A 3D map of the largest donors, ringed by industry around the parties they gave to, with the words layer showing who speaks on each industry's debates. Federal, Queensland and Victorian disclosures.
- **Standing investigations.** Six reports (climate and energy, gambling, housing, immigration, First Nations, media ownership) regenerated from the knowledge box, pairing the money with the words.
- **Explore.** Time machine, the record quiz, the ledger, who owns which debate, words per dollar, then versus now.

## Architecture

```
Browser (static SPA, hash router)
   │
   ▼
Cloudflare Worker  portal/src/index.ts     /api/search  /api/ask (JSON or SSE)  /api/resource  /api/topic ...
   │
   ▼
Progress Agentic RAG knowledge box         speeches, news, division records; topic labels and summaries from enrichment tasks
```

There is no live database behind the site. Structured data (donations, votes, expenses, interests, grants, contracts) stays relational in a SQLite corpus on the data box and reaches the site as static JSON exported by `scripts/export_*.py`.

`MIGRATION-ARAG.md` is the runbook: knowledge box identity, model pins, corpus inclusion rules, cost gates, platform quirks learned the hard way.

## Repository layout

| Path | What it is |
|------|------------|
| `portal/` | The site: Worker (`src/index.ts`), static front end (`public/`), 3D map engine (`graph/`, bundled to `public/money-map.js`) |
| `parli/ingest/` | Fetchers and loaders for every source, and `arag_sync.py`, which pushes the corpus into the knowledge box |
| `parli/arag.py` | Knowledge box client used by the sync, the enrichment scripts and the report generator |
| `parli/schema.py`, `parli/db.py` | The SQLite corpus schema and connection helpers |
| `scripts/` | Static JSON exports, report generation, the ask harness, enrichment and provisioning tools |
| `docs/` | Data notes: `VOTES.md`, `DATA-MONEY.md`, `DATA-WORDS.md`, `DATA-INTERESTS.md`, `STREAMING.md` |
| `*_DATA_SOURCES.md` | Source surveys and licensing notes |

## Running the site locally

```bash
cd portal
npm install
printf 'ARAG_KB_TOKEN=...\n' > .dev.vars   # the knowledge box token; zone and KB id are in wrangler.jsonc
npx wrangler dev                              # http://localhost:8787
```

Deploy with `npm run deploy` from `portal/` — **not** `npx wrangler deploy`. The
npm script runs `scripts/stamp_assets.mjs` first, which content-hash stamps the
`?v=` on `/app.js` and `/style.css` in `index.html`; those two are served
`immutable` for a year, so an unstamped deploy strands returning visitors on the
old bundle. See `docs/HARDENING.md`.

The committed `public/money-map.js` must equal a fresh build:

```bash
npx esbuild graph/index.ts --bundle --minify --format=esm --target=es2022 --outfile=public/money-map.js
node graph/smoke-test.mjs
```

## Data pipeline

The corpus lives in `~/.cache/autoresearch/parli.db` on the data box. Python tooling is managed with `uv`:

```bash
uv sync
uv run python -m parli.ingest.arag_sync --tables speeches,news_articles --full   # push to the knowledge box
uv run python scripts/generate_reports.py                                          # regenerate the six reports
uv run python scripts/ask_harness.py                                               # 24 grounded questions against production
```

Environment variables are documented in `.env.example`. Never commit `.env` or `portal/.dev.vars`.

## Data sources

| Source | What we take |
|--------|--------------|
| Federal Hansard (House via Zenodo, Senate and recent House via OpenAustralia) | speeches since 1998 |
| Senate committee hearings | transcripts |
| NSW, Victorian, SA and Queensland parliaments | Hansard speeches |
| TheyVoteForYou and state Hansard | recorded divisions, per-member voting records |
| AEC, ECQ and VEC disclosures | donations, classified across 27 industries |
| IPEA | parliamentary expenses |
| Registers of interests, lobbyist registers, ministerial diaries | declared interests and access |
| Guardian Australia and ABC | news coverage |

Licensing and coverage per source are recorded in the `docs/` notes and the `*_DATA_SOURCES.md` surveys.

## Contributing

Work on a branch and open a pull request; `main` is deployed manually and always matches production. Useful places to start:

1. **Data coverage:** ingestion for WA, Tasmania, the NT and the ACT parliaments.
2. **The record:** harness questions in `scripts/ask_questions.json`, and prompt or retrieval improvements in `portal/src/index.ts`.
3. **The site:** the static front end is plain HTML, CSS and JavaScript with no build step.

## Origins

OPAX grew out of an [autoresearch](https://github.com/karpathy/autoresearch) experiment, pivoted to parliamentary transparency. The first version ran as a FastAPI and Next.js stack on a single server; it was retired in September 2026 in favour of the Worker and knowledge box described above.

## License

OPAX is licensed under the [GNU Affero General Public License v3.0](LICENSE). You are free to use, modify and distribute it, but modifications to the web service must also be made available as open source.

---

Built with data from [OpenAustralia](https://www.openaustralia.org.au/), [TheyVoteForYou](https://theyvoteforyou.org.au/), the [AEC](https://www.aec.gov.au/), the state parliaments and electoral commissions, and the [Guardian](https://www.theguardian.com/au) and [ABC](https://www.abc.net.au/news).
