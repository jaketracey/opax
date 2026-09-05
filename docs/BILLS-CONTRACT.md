# OPAX bills: the shared contract (phase 1, federal 2013–2026)

Four agents build this in parallel, each in its own worktree and branch. This file is the agreement between them. Read `SCOPE-BILLS.md` (in the `scope-bills` worktree, copied to `docs/SCOPE-BILLS.md` in each worktree) for the measured facts behind it. Nobody deploys; nobody touches `CACHE_EPOCH`; nobody deletes data. The database on `desktop` (`/home/jake/.cache/autoresearch/parli.db`, via `ssh desktop`) is backed up before any write (`cp parli.db parli.db.bak-bills-<date>` once, by the registry agent; others open it read-only or write only to their own tables).

## Keys and identity

- `bill_key`: `au-federal-r<billhome id>` for ParlInfo bills (e.g. `au-federal-r7531`); `au-federal-alrc-<bill_id>` only for ALRC-only rows with no billhome match. States later: `au-nsw-<id>` etc.
- KB resource slug for a bill: `bill-<bill_key>`. Labels: `kind/bill`, `state/federal`, `decade/<2010s|2020s>`, `parliament/<47>`, `status/<status>`, `sponsor_party/<party>` when known.

## Tables (SQLite on desktop; the registry agent owns creation; the others only read them or write to the table named as theirs)

- `bills_v2(bill_key PK, jurisdiction, source_system, source_id, parliament, session, title, short_title, aliases_json, introduced_date, originating_house, sponsor_name, sponsor_person_id, portfolio, status, status_raw, status_as_of, legacy_bill_id, updated_at)`
- `bill_events(bill_key, stage, date, house, event_raw, source_url)`
- `bill_sources(bill_key, kind ['billhome','text','em','em_revised','em_supp','digest','frl_act'], source_id, url, document_date, fetched_at, licence, content_hash, cache_path, outline_text NULL)` — the registry agent fetches and stores the selected EM outline (or digest purpose section) text in `outline_text`, so the summaries agent never fetches.
- `bill_summaries(bill_key, version, basis ['em','digest'], describes_version, as_of, summary_json, model, provider, prompt_version, input_tokens, output_tokens, generated_at, review_state ['draft','ok','flagged'], superseded_by)` — **owned by the summaries agent**.
- `bill_links(bill_key, kind ['division','speech','act'], target_key, rule, confidence, evidence_json, audited ['','ok','wrong'])` — owned by the registry agent (joins).

## Static projection (`portal/public/bills/`)

- `index.json`: `{ "generated_at", "count", "bills": [ { key, title, short_title, jurisdiction, parliament, introduced, originating_house, status, status_as_of, sponsor, sponsor_party, portfolio, has_summary, summary_version, divisions, speeches, acts } ] }` (arrays sorted by introduced desc).
- `<key>.json`: `{ key, title, short_title, aliases, jurisdiction, parliament, introduced, originating_house, sponsor, sponsor_party, sponsor_person_id, portfolio, status, status_as_of, key_dates: [{stage, date, house, url}], sources: [{kind, url, document_date, licence}], summary: null | { version, basis, attribution, describes_version, as_of, sentences: [s1,s2,s3], changes: [..3-6], affected: "…", model, generated_at }, divisions: [{ key, date, house, question, stage, ayes, noes, outcome, party_splits: {party: {ayes, noes}} , url}], speeches: [{ slug, speaker, party, state, date, stage_hint, brief }], acts: [{ title, frl_uri, assent_date }] }`
- The exposure agent writes the generator (`scripts/export_bills.py`) that produces both from the tables; the UI agent builds against a fixture produced by running that generator on the existing ALRC rows (no summaries) until real data lands.

## Summary contract (the summaries agent's generator)

Input: `outline_text` (EM outline or digest purpose section) plus registry metadata. Output JSON: `{ "sentences": [3 plain-English sentences], "changes": [3–6 factual bullets], "affected": "one sentence", "confidence": "high|medium|low", "flags": [] }`. Attribution line stored with the summary: `Written by a model from the explanatory memorandum; not the record` (or `…from the Bills Digest…`). Never republish EM or digest text verbatim beyond short quoted phrases; the summary is the model's own words about the facts. Model: `deepseek/deepseek-v4-flash` through OpenRouter (`OPENROUTER_API_KEY` in `.env`), `reasoning: {enabled:false}`, JSON output; budget cap $10 for the whole phase, tracked from response usage and printed at the end.

## Portal (the exposure and UI agents)

- Worker: add `bill` to the `KINDS` allowlist for search and ask filters; a `/bill/<key>` SEO route serving the app shell with title and description from `index.json`; no new generation.
- KB: `scripts/publish_bills.py` (exposure agent) upserts `bill-<key>` resources with the summary text as the body, structured data in `extra.metadata`, and the labels above; idempotent by content hash; capped at 3,500 resources; never deletes.
- UI: route `/bill/<key>` in app.js; person vote lists open a summary disclosure on tap; party pages list bill divisions with party splits; document pages attach a bill panel when the speech's title matches a bill; the Time Machine lists a year's bills. Bill lookup failure never hides a vote.

## House register

Broadsheet, bronze on paper, hairline rules, Merriweather serif, no uppercase eyebrow labels beyond the existing kicker, 44px targets, mobile first at 390, reduced motion respected. Model text is always marked as such.
