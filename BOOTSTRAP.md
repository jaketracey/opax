# OPAX Bootstrap Guide — Next Session Quick Start

## 1. Start Services (30 seconds)

```bash
cd /home/jake/autoresearch

# Terminal 1: FastAPI backend
source .env && uv run uvicorn parli.api:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Next.js frontend
cd opax && node node_modules/.bin/next dev -p 3000 -H 0.0.0.0

# Or use tmux:
tmux send-keys -t 0:0.2 "ANTHROPIC_API_KEY='...' uv run uvicorn parli.api:app --host 0.0.0.0 --port 8000 --reload" Enter
tmux send-keys -t 0:0.3 "cd /home/jake/autoresearch/opax && node node_modules/.bin/next dev -p 3000 -H 0.0.0.0" Enter
```

## 2. Verify Everything Works

```bash
# Check database
uv run python -c "
from parli.schema import get_db; db=get_db()
for t in ['speeches','donations','members','votes','speech_topics','bills','legal_documents']:
    print(f'{t}: {db.execute(f\"SELECT COUNT(*) FROM {t}\").fetchone()[0]:,}')
"

# Check API
curl -s http://localhost:8000/api/stats | python3 -m json.tool

# Check frontend
curl -s http://localhost:3000 | head -5
```

## 3. Key File Locations

| What | Where |
|------|-------|
| Database | `~/.cache/autoresearch/parli.db` (~14GB) |
| Embeddings | `~/.cache/autoresearch/hansard/embeddings/` (1.2GB) |
| Python backend | `parli/` (schema, api, rag, search, embeddings, ingest/, analysis/) |
| Next.js frontend | `opax/src/app/` (30 pages) |
| API keys | `.env` |
| Deploy scripts | `deploy/` |
| EC2 IP | `deploy/ec2-ip.txt` (13.239.186.152) |
| CLAUDE.md | Project guide for Claude Code |

## 4. WSL Config

```
# /mnt/c/Users/jaket/.wslconfig
[wsl2]
memory=28GB
processors=16
swap=8GB
networkingMode=nat
```

## 5. Current Data Status

- **831K speeches** from 7 sources (1901-2026)
- **232K legal documents** (court decisions, legislation)
- **205K donations** (68% classified across 31 industries) — NOTE: donation count may need re-ingest
- **127K votes** across ~900 divisions
- **2.3M topic assignments** (20 topics)
- **5,313 bills** with lifecycle tracking
- **1,697 members** (current + historical)
- **100% speech embeddings** (831K, 384-dim)
- **30 frontend pages**

## 6. Data Gaps to Close

Priority order:
1. **Re-run donation classification** — the re-ingest cleared industry labels: `uv run python -m parli.ingest.classify_donations`
2. **Deploy database to EC2** — 14GB file, needs stable rsync: `rsync -avz --progress -e "ssh -i ~/.ssh/opax-key.pem" ~/.cache/autoresearch/parli.db ubuntu@13.239.186.152:~/opax-data/`
3. **More VIC Hansard** — `uv run python -m parli.ingest.vic_parliament --since 2015-01-01 --max-days 500`
4. **More NSW Hansard** — `uv run python -m parli.ingest.nsw_hansard --start 2015-01-01`
5. **QLD Hansard** — `uv run python -m parli.ingest.qld_parliament --hansard-only`
6. **More votes** — `source .env && uv run python parli/ingest/fetch_division_votes.py`
7. **Guardian news** — `uv run python -m parli.ingest.guardian_news --all-topics --limit 500`
8. **Re-embed if new speeches added** — `uv run python -m parli.embeddings`
9. **Re-link speakers** — `uv run python -m parli.ingest.link_speakers`
10. **Rebuild FTS5** — `uv run python -c "from parli.schema import get_db; db=get_db(); db.execute(\"INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')\"); db.commit()"`

## 7. Generate New Investigation Pages

```bash
# Auto-generate from any topic:
uv run python -m parli.generate_investigation --topic "aged care" --output opax/src/app/aged-care/page.tsx
uv run python -m parli.generate_investigation --topic "taxation" --output opax/src/app/taxation/page.tsx

# With Claude API for narrative:
ANTHROPIC_API_KEY='...' uv run python -m parli.generate_investigation --topic "cost of living" --output opax/src/app/cost-of-living/page.tsx
```

## 8. API Keys

All in `.env`:
- `ANTHROPIC_API_KEY` — Claude API for RAG
- `TVFY_API_KEY` — TheyVoteForYou
- `OPENAUSTRALIA_API_KEY` — OpenAustralia

## 9. EC2 Production

- Instance: i-0831a3cc55b36c432 (t4g.medium, ap-southeast-2)
- IP: 13.239.186.152
- SSH: `ssh -i ~/.ssh/opax-key.pem ubuntu@13.239.186.152`
- SSL: configured via certbot for opax.com.au
- Needs: database + embeddings synced to ~/opax-data/

## 10. Architecture Quick Reference

```
Browser → Next.js (3000) → FastAPI (8000) → SQLite + Embeddings
                                           ↓
                                    Claude API (RAG)
```

Frontend: Next.js 16 + Tailwind v4 + Recharts
Backend: FastAPI + SQLite + sentence-transformers + anthropic SDK
Search: Hybrid (semantic embeddings + FTS5 keyword)
RAG: Topic-aware context retrieval → Claude API → sourced answers
