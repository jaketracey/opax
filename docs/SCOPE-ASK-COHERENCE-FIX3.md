# Ask coherence fix 3: full scope agreement for ranking repair

Review: `/Users/jake/Projects/opax-ios/.ops/codex-runs/review-ask-coherence-r3.last.md`.
Parent: `f06b3c1af0486288066a79de3848a604468c52c5`.

## Scope check in three lines

1. The research loop carries its resolved constraints in typed `answer_scope`, through numerical and qualitative answers, the writer, JSON/SSE, ordinary fallback and cache. Legacy payloads resolve explicit constraints conservatively; unqualified receipts retain the existing federal default.
2. Each ranking fact must agree on jurisdiction, chamber, recipient party and requested entity type together. Party aliases are canonicalized; unknown or conflicting required dimensions veto reconstruction. Every donor row and accompanying coverage source is checked, including the LNP's separate Queensland and federal selections.
3. Requested period endpoints must agree with the figure's own period; an aggregate cannot answer a single year. A bare money year retains the tool's existing financial-year-start convention. Legacy period coverage can bind only to the same party, jurisdiction and selection scope. A veto leaves checked points or the existing specific limitation.

The original requirement for an audited, rejected ranking figure remains. Figure-free decisions, refusals and clarifications cannot grant repair permission. Financial ownership auditing is unchanged.

## Tests first

The initial scope matrix ran before implementation: **377 tests, 153 failures**, reproducing the missing scope vetoes. The final scope file has **448 passing tests**, including:

- The reviewer's saved COH-LNP `fact-1`, isolated from its other sources: a federal LNP question cannot reconstruct the Queensland J.J. Richards ranking at $754,314. A Queensland question can use that same saved fact.
- Matching federal/federal evidence permits repair; Queensland/federal and federal/Queensland are both rejected. Every state and territory has matching and federal mismatch controls in both directions.
- 2019–20 versus the 1998–99 to 2025–26 aggregate, and the reverse mismatch; matching financial year; mismatched and unknown periods.
- Senate/House and House/Senate; matching Senate; unknown chamber. Separate typed speech-count controls exercise the non-donor ranking gate, including repeated values with different periods.
- Labor/Liberal and Liberal/Labor; One Nation/Pauline Hanson's party and LNP/Liberal National Party aliases.
- Company/person and person/company; matching company; unknown entity type. A party total cannot be reconstructed for a personal-recipient question.
- The conjunction across all dimensions, a single-dimension veto, resolved request filters retained across boundaries, mixed selected sources, and unrelated coverage that cannot lend a figure its period.

All requested scope controls and their inverse controls run on the eight JSON/SSE × ordinary/fallback × fresh/cache paths. The fixture is a trimmed copy of the saved Queensland source; other matrix data is synthetic. The actual research-loop and writer tests also check constraint propagation.

The focused run, including earlier coherence decisions, roster/Bill Shorten ownership and salary preservation controls, passes **673/673**.

## Offline replay: every difference

Network access is replaced with a throwing function in both replay drivers. No Ask or model call runs.

| Saved population | r4 arm | B arm | Sentence, citation-key/range or grade differences versus parent |
|---|---:|---:|---|
| Original questions | 50 | 50 | None |
| Donor questions | 6 | 6 | None |
| Follow-up turns | 23 | 23 | None |
| Total | 79 | 79 | **None across 158 payloads** |

Two checks were made: the previous boundary's saved 158 outputs remain unchanged and idempotent; the original paired finals also produce identical answers, citations and grades through the parent boundary and this patch. Earlier boundary migrations, including GOLD-M03's citation repair, are inherited rather than counted as changes in this patch.

Private artifacts are in `portal/private/ask-coherence-fix3/`: `replay.json`, `raw-replay.json`, their drivers, gate logs and `invariants.json`.

| B metric | Parent | Fix 3 |
|---|---:|---:|
| Original correctness P/partial/F | 39/6/5 | 39/6/5 |
| Original citations P/partial/F (n/a) | 38/0/0 (12) | 38/0/0 (12) |
| Dates | 23/23 | 23/23 |
| Declines | 48/50 | 48/50 |
| Original coherence | 50/50 | 50/50 |
| Donor golds | 6/6 | 6/6 |
| Follow-up turns / conversations | 23/23; 10/10 | 23/23; 10/10 |
| Audit findings, both replay arms | 0 | 0 |

The previously reported GOLD-M03 correctness failure and PAY-COMPARE refusal remain; this patch does not claim to resolve those earlier limitations.

## Gates and invariants

- `npm run build:search`, then the full portal suite: **3,176/3,176**, zero failures or skips.
- `npx tsc --noEmit`, `npm run check`, and Wrangler's local `deploy --dry-run` pass.
- `votes.json` and `pay.json` are byte-identical to the parent; SHA-256 values are recorded in `invariants.json`.
- The entire claim audit is byte-identical to names-only `8954ed767`. The six financial functions have **no diff** against literal live r4 `31e00250a`.
- No deadline, model reserve, model configuration, feature flag or claim-plan lane change. No production request, push or deployment.
- New model calls: **0**. New spend: **US$0.00**.
