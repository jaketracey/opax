# Ask post-deploy round 2: strict party ownership

**Round 3 replaces the period-word check with the shared fail-closed allowlist:** [allowlisted ownership](SCOPE-ASK-POST-DEPLOY-R3.md).

Base: `d942ef4ae2d370a8ab64343a6fb55ac0f80500a1`. This round supersedes the prior surname and affiliation policy. No model calls, production requests, push or deployment; spend US$0.

Party resolution requires all three conditions:

1. One roster person matches by full name, full display name or canonical roster slug. Surnames and bare common words cannot identify an owner; duplicate identities clarify.
2. `party_now` supplies a political party. Independent, unaffiliated, absent and other non-party labels clarify.
3. The question has no named period. Years, financial years, date ranges and relative periods such as “back then” clarify because the roster has no dated affiliation evidence. Identity text is masked before this check.

The reason is carried to the existing typed clarification before research, tools or a writer run. Unsupported scopes have no person/party filter and cannot use the answer cache. No financial audit, ranking allowlist or reconstruction-permission rules changed.

## Tests

`portal/test/ask-party-subject-strict.test.mjs` adds **149 tests**: 17 question controls across JSON/SSE × ordinary fallback × cache (136), plus 13 identity and affiliation checks. They cover the three review reproductions, exact Hanson production question, Hanson with a year, surname-only ownership, Hanson’s speech preserving person scope, canonical slugs, financial years, ISO ranges, “back then”, display names, common words, duplicate identities and non-party labels. Clarifications invoke no tool or model; selected Hanson evidence cannot turn them into a ranking. Hanson’s undated answer still leads with the cited Westpac $161,787 ranking.

The previous Albanese positive control now uses the full name **Anthony Albanese**; surname-only Albanese is a negative control. Existing coverage, names, protected decisions and legacy parity controls remain.

## Replay

All **158 saved final payloads** were replayed offline through the prior commit and the new boundary with the same grader: 79 per saved arm (50 original, six donor, 23 follow-up turns). **Zero sentence, citation-key/range or full-grade differences**, zero audit findings, and zero idempotence differences. Difference list: **none**. Network/model calls and spend: zero.

## Gates

**3,558/3,558 full portal tests pass**, after `npm run build:search`. TypeScript (`npx tsc --noEmit`), `npm run check` and `wrangler deploy --dry-run` pass. `votes.json`, `pay.json` and `research-claim-audit.mjs` are byte-identical to the parent commit (and live release). Evidence and complete logs are in git-ignored `portal/private/ask-post-deploy-r2/`.
