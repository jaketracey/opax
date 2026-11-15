# OPAX

**The public record of Australian politics, searchable and citable.**

[opax.com.au](https://opax.com.au) · [iPhone and iPad app](https://apps.apple.com/au/app/opax/id6818756305) · [MCP server](https://opax.com.au/mcp) · [Methods and how to cite](https://opax.com.au/methods) · [Sources and coverage](https://opax.com.au/stats)

OPAX, the Open Parliamentary Accountability Exchange, puts the public record of Australian politics in one place: what was said in parliament, how each member voted, federal bills, political receipts disclosed to electoral commissions, government grants and contracts, declared interests and official reports. Every item links to the body that published it, so a reader can check it at the source.

OPAX reports what the record says. It does not give opinions, predict results, rate politicians or parties, or advise anyone how to vote. A recorded connection between two names, such as a receipt and a grant, does not show that one caused the other. OPAX is free, open source and non-partisan, and it is not affiliated with any parliament, government, party or candidate.

## What it holds

Counts as at 15 November 2026, from [opax.com.au/api/stats](https://opax.com.au/api/stats). They grow as records are added.

| Collection | Count | Detail |
|---|---:|---|
| Hansard speeches | 964,517 | Commonwealth 740,302 · NSW 115,308 · Victoria 50,744 · SA 37,971 · Queensland 10,228 · ACT 9,964 |
| Recorded divisions | 14,244 | Result, party votes and each member's vote |
| Federal bills | 2,994 | With 4,747 bill texts and explanatory material |
| Federal grant awards | 8,354 | From GrantConnect |
| Ministerial transcripts and releases | 7,063 | Prime Minister and ministers |

OPAX also holds political receipts disclosed to the Australian Electoral Commission, the Victorian Electoral Commission and the Electoral Commission of Queensland; Commonwealth contracts; registers of members' interests, ministerial diaries and lobbyist registers; parliamentary pay and expenses; Senate estimates and committee hearings; and annual, audit, integrity and royal commission reports.

Coverage varies by source, jurisdiction and year. [Sources and coverage](https://opax.com.au/stats) lists each source with its dates and reuse terms.

## Ways to use it

- **Website: [opax.com.au](https://opax.com.au).** Ask a question in plain English and get an answer written only from retrieved records, with citations. When the record is thin, the answer says so. You can also search and filter the records directly, and browse profiles of parliamentarians, parties, electorates, bills, receipt sources, programs and reports.
- **iPhone and iPad: [OPAX on the App Store](https://apps.apple.com/au/app/opax/id6818756305).** Free, in Australia and the United States.
- **AI tools: `https://opax.com.au/mcp`.** A read-only [Model Context Protocol](https://modelcontextprotocol.io) server with 16 tools for votes, bills, Hansard, political money, grants, declared interests and specialised registers. It needs no account. Setup steps are at [opax.com.au/mcp](https://opax.com.au/mcp).

To cite OPAX, or to check how a figure was produced, see [Methods and how to cite](https://opax.com.au/methods).

## How it works

```
Browser (static front end)            MCP clients
        │                                  │
        ▼                                  ▼
Cloudflare Worker  portal/src/index.ts   /api/search  /api/ask (JSON or SSE)  /api/resource ...  /mcp
        │
        ▼
Progress Agentic RAG knowledge box       speeches, bills, official statements, division records; topic labels and summaries from enrichment
```

There is no live database behind the site. Structured data (receipts, votes, expenses, interests, grants, contracts) stays relational in a SQLite corpus on the data box and reaches the site as static JSON exported by `scripts/export_*.py`.

`MIGRATION-ARAG.md` is the runbook: knowledge box identity, model pins, corpus inclusion rules, cost gates, and platform quirks learned the hard way.

## Repository layout

| Path | What it is |
|------|------------|
| `portal/` | The site: Worker (`src/index.ts`), static front end (`public/`), 3D money map engine (`graph/`, bundled to `public/money-map.js`) |
| `portal/src/tools/` | The MCP tools (`mcp-*.ts`) served at `/mcp` |
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

Run the portal tests with `npm test` from `portal/`. Some suites read Python fixtures that need `openpyxl`: in a fresh worktree run `uv sync --frozen` at the repo root first (or set `OPAX_PYTHON`), otherwise those tests skip, and with `CI` set they fail.

Deploy with `npm run deploy` from `portal/`, **not** `npx wrangler deploy`. The npm script runs `scripts/stamp_assets.mjs` first, which content-hash stamps the `?v=` on `/app.js` and `/style.css` in `index.html`. Those two are served `immutable` for a year, so an unstamped deploy strands returning visitors on the old bundle. See `docs/HARDENING.md`.

The committed `public/money-map.js` must equal a fresh build:

```bash
npx esbuild graph/index.ts --bundle --minify --format=esm --target=es2022 --outfile=public/money-map.js
node graph/smoke-test.mjs
```

## UI reference

[Component language](docs/UI_DESIGN_LANGUAGE.md), [control recipes](docs/UI_CONTROLS.md), [homepage structure](docs/HOME_PROTOTYPE.md) and [remaining consolidation work](docs/UI_COMPONENT_AUDIT.md). The homepage uses `/`; Ask and Search share `/ask`, with `view=search` selecting Search. Workbench and prototype review assets are local-only and excluded from deployment.

## Data pipeline

The corpus lives in `~/.cache/autoresearch/parli.db` on the data box. Python tooling is managed with `uv`:

```bash
uv sync
uv run python -m parli.ingest.arag_sync --tables speeches --full   # push to the knowledge box
uv run python scripts/generate_reports.py                          # regenerate the reports
uv run python scripts/ask_harness.py                               # grounded questions against production
```

Reports retrieve original records across the corpus, with date windows rather than a Hansard-only topic filter. Each report includes a dedicated non-speech evidence question. Generated summaries and bill registry cards are excluded; original bill text, explanatory memoranda and other primary records remain eligible. Speech counts and charts use the current topic-labelled speech catalogue; the financial charts keep the separately audited `scripts/report_stats.json` snapshot.

Set `REPORT_STRUCTURED_WRITER=codex` to use the installed Codex CLI for structured figures, party positions and introductions. Narratives still use the knowledge box's configured writer. Run `uv run python scripts/validate_reports.py` before publishing to check citations against the live corpus.

Environment variables are documented in `.env.example`. Never commit `.env` or `portal/.dev.vars`.

## Main sources

| Source | What OPAX takes |
|--------|--------------|
| Federal Hansard (House via Zenodo, Senate and recent House via OpenAustralia) | Speeches since 1998 |
| Senate committee hearings | Transcripts |
| NSW, Victorian, SA, Queensland and ACT parliaments | Hansard speeches |
| PM&C and NSW Government | Prime Minister transcripts and ministerial releases |
| TheyVoteForYou and state Hansard | Recorded divisions and per-member votes |
| AEC, VEC and ECQ disclosures | Political receipts, classified by industry |
| IPEA | Parliamentary expenses |
| Registers of interests, lobbyist registers, ministerial diaries | Declared interests and access records |

Licensing and coverage for each source are recorded in the `docs/` notes, the `*_DATA_SOURCES.md` surveys and [Sources and coverage](https://opax.com.au/stats).

## Contributing

Work on a branch and open a pull request. Merges to `main` that change the site deploy automatically through `.github/workflows/deploy.yml`; changes to docs, tests and tooling do not. Good places to start:

1. **Coverage:** ingestion for the Western Australian, Tasmanian and Northern Territory parliaments.
2. **Answer quality:** harness questions in `scripts/ask_questions.json`, and prompt or retrieval improvements in `portal/src/index.ts`.
3. **The site:** the static front end is plain HTML, CSS and JavaScript with no build step.

## Security

Please report vulnerabilities privately, through GitHub's [private vulnerability reporting](https://github.com/jaketracey/opax/security/advisories/new) or by email to support@opax.com.au. More at [opax.com.au/security](https://opax.com.au/security).

## Who makes it

OPAX is built in Melbourne by Jake Tracey and published by Noice Pty Ltd. Questions and corrections: support@opax.com.au.

It grew out of an [autoresearch](https://github.com/karpathy/autoresearch) experiment that turned to parliamentary records. The first version ran on FastAPI and Next.js on a single server; it was retired in September 2026 for the Worker and knowledge box described above.

## Licence

The code is licensed under the [GNU Affero General Public License v3.0](LICENSE): you may use, change and share it, and changes to a hosted version of the service must be published under the same licence. The records come from their publishers under their own terms; [Sources and coverage](https://opax.com.au/stats) lists them.

---

With thanks to [OpenAustralia](https://www.openaustralia.org.au/) and [TheyVoteForYou](https://theyvoteforyou.org.au/), whose open data OPAX builds on, and to the parliaments, electoral commissions and agencies that publish the record.
