# OPAX — Open Parliamentary Accountability eXchange

**Exposing governance blind spots by cross-referencing what politicians say, how they vote, and who funds them.**

[opax.com.au](https://opax.com.au)

---

**1M+ speeches** | **300K+ votes** | **205K donations** | **16K contracts** | **5 parliaments**

---

## What OPAX Does

OPAX is an open-source parliamentary transparency platform that connects the dots between political rhetoric, voting records, and money flows in Australian democracy.

- **Disconnect scoring** — Measures the gap between what MPs say in parliament and how they actually vote. A politician who gives 200 speeches about climate action but votes against every reform gets a high disconnect score.
- **Follow the money** — Cross-references 205,000+ political donations (classified across 27 industries at 99.9% coverage) with voting records to reveal which industries buy influence with which parties.
- **Pay-to-play detection** — Links companies that donate to political parties with the government contracts they win, and finds speeches where MPs mentioned those companies. 19,000+ connections identified across 374 companies.
- **Multi-parliament coverage** — Ingests data from the federal parliament plus four state parliaments (VIC, NSW, QLD, SA) and Senate committee hearings, covering over a million parliamentary speeches from 2,254 members.

## Architecture

```
Browser  -->  Next.js 16 (frontend)  -->  FastAPI (API)  -->  SQLite + Embeddings
                                                          |
                                                          +-->  Claude API (RAG)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind v4, Recharts, shadcn/ui |
| Backend | FastAPI, SQLite (WAL mode, FTS5), sentence-transformers |
| Search | Hybrid: semantic embeddings (all-MiniLM-L6-v2, 384-dim) + FTS5 keyword, fused via Reciprocal Rank Fusion |
| RAG | Topic-aware context retrieval feeding Claude for evidence-based answers |
| Analysis | Disconnect scoring, donor-vote correlation, contract-speech cross-referencing |

## Data Sources

| Source | Records | Coverage |
|--------|---------|----------|
| Federal Hansard (OpenAustralia) | 395K speeches | 1901-2026 |
| Senate Committee Hearings | 150K+ speeches | 2025-2026 |
| Victorian Parliament | 49K+ speeches | 2015-2026 |
| NSW Parliament | 74K+ speeches | 2015-2026 |
| SA Parliament | 56K+ speeches | 2020-2026 |
| QLD Parliament | 14K speeches | 2024-2026 |
| AEC Donations | 205K records | 27 industries classified |
| TheyVoteForYou | 304K votes | 4,000 divisions |
| AusTender Contracts | 16K contracts | $100K+ since 2013 |
| Guardian Australia | 1,840 articles | 6 policy topics |
| Historical Hansard (Wragge/Trove) | 250K+ speeches | 1901-1980 |

## Investigation Pages

| Page | Description |
|------|-------------|
| `/gambling` | 25 years of speeches vs $65M in industry donations |
| `/housing` | Every party promises affordability while home ownership falls |
| `/climate` | 24,000+ speeches, $1.96B in fossil fuel donations |
| `/pay-to-play` | Companies that donate to parties and win government contracts |
| `/disconnect` | Rankings of MPs with the biggest say-vs-vote gap |
| `/donor-influence` | How industry donations correlate with parliamentary votes |
| `/donations` | Industry breakdown, treemap, sortable donor tables |
| `/indigenous` | 25,000+ speeches on reconciliation and First Nations |
| `/media` | Three companies control what Australians see |
| `/compare` | Side-by-side MP comparison across all metrics |

Plus 20 more pages covering education, defence, immigration, foreign policy, electorates, bills tracker, democracy scorecard, and state-specific investigations.

## Analysis Engines

### Disconnect Scoring
```
disconnect = speech_intensity * (1 - vote_alignment)
```
Measures hypocrisy per MP per topic. Score 0.0 = consistent, 1.0 = maximum disconnect.

### Donor-Vote Correlation
For each (party, industry) pair: sums donations, finds related divisions, computes favorable vote percentage, produces an influence score.

### Pay-to-Play Detection
Cross-references AusTender contracts with AEC donations and Hansard speeches. Identifies companies appearing in all three datasets — donating, winning contracts, and being mentioned in parliament.

### Topic Insights
Generates per-topic research: key statistics, impactful quotes, disconnect alerts, donor connections, and trend data.

## Quick Start

```bash
# Install dependencies
uv sync
cd opax && npm install && cd ..

# Initialize database
uv run python -m parli.schema

# Download Hansard data
uv run download_hansard_fast.py --backfill-all --workers 10

# Build embeddings
uv run python -m parli.embeddings

# Start backend
uv run uvicorn parli.api:app --host 0.0.0.0 --port 8000

# Start frontend (separate terminal)
cd opax && npx next dev -p 3000 -H 0.0.0.0
```

See [BOOTSTRAP.md](BOOTSTRAP.md) for detailed setup including data ingestion, state parliaments, and analysis engines.

## API Keys Required

| Key | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Claude API for RAG answering |
| `TVFY_API_KEY` | TheyVoteForYou voting records |
| `OPENAUSTRALIA_API_KEY` | Hansard downloads |

Store in `.env` at the project root. Never commit this file.

## Contributing

OPAX is built on the belief that parliamentary transparency is a public good. Contributions are welcome:

1. **Data coverage** — Add ingestion scripts for new data sources (WA, TAS, NT, ACT parliaments; lobbyist registers; royal commission recommendations)
2. **Analysis** — Build new analysis engines (sentiment analysis, network clustering, time-series anomaly detection)
3. **Frontend** — Create new investigation pages or improve existing visualizations
4. **Infrastructure** — Help with deployment, testing, or CI/CD

## Origins

OPAX is built on [Karpathy's autoresearch framework](https://github.com/karpathy/autoresearch), pivoted from LLM pretraining experiments to a parliamentary transparency platform.

## License

OPAX is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

This means you're free to use, modify, and distribute this software, but any modifications to the web service must also be made available as open source. This protects the public interest nature of parliamentary transparency work.

---

Built with data from [OpenAustralia](https://www.openaustralia.org.au/), [TheyVoteForYou](https://theyvoteforyou.org.au/), [AEC](https://www.aec.gov.au/), and [AusTender](https://www.tenders.gov.au/).
