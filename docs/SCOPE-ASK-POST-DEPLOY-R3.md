# Ask post-deploy round 3: allowlisted party ownership

Base: `2960037085a83e328e150a73d5893e11fef23d2b`. No model calls, production requests, push or deployment; spend US$0.

## Permission

The full-identity and real-party rules remain. After substituting the verified roster party into the owner slot, party ownership is accepted only by `rankingRepairQuestion(resolved, {}, {unqualified:true})`. That is the same whole-question grammar used for ranking repair. It must consume every token and must contain no optional year, financial-year or jurisdiction slot. The four existing form families are:

- Who gives/gave/donates/donated the most [money] to PARTY?
- Which company gives/gave/donates/donated the most [money] to PARTY?
- Top donors to PARTY.
- Who does PARTY take the most money from?

The period-word list is deleted. Unrecognised wording, implicit periods, extra words, other verbs and qualified forms all produce a typed clarification before research, tools, writing or cache access. The old computed-owner exception (“the party of the MP who …”) also now clarifies. Ordinary person speech questions retain person scope. Other ranking-repair callers retain their existing year and jurisdiction support; no verbs, aliases or grammar forms were added.

“Who funds Mark Butler's party?” does not match a form. On all eight paths it returns: **“Which party do you mean? Please name the party directly so I can check the records for your question.”** No tool or model is called.

## Tests and replay

**92 additional tests:** 88 boundary variants (11 controls × JSON/SSE × ordinary fallback × cache), plus positive checks for all four unqualified form families. They include “during the pandemic”, five further implicit-period/extra-word controls, Mark Butler’s “Who funds” question, financial-year and explicit federal/state slots, and the former computed-owner exception. Existing eight-path Hanson positives, speech/person controls, full identity, Independent, surname and coverage controls remain. The legacy parity gate explicitly checks M04’s new clarification rather than allowing a derived-party ranking.

All **158 saved final payloads** replay offline through the parent and current boundary with the same grader: **zero sentence, citation-key/range or full-grade differences**, zero audit findings and zero idempotence differences. Difference list: **none**. A new request with a non-allowlisted owner phrase clarifies; previously checked saved claims are not rewritten into a different answer.

## Gates

**3,650/3,650 full portal tests pass**, following `npm run build:search`. TypeScript (`npx tsc --noEmit`), `npm run check` and `wrangler deploy --dry-run` pass. `votes.json`, `pay.json` and the financial/attribution audit are byte-identical to the parent commit and release. Evidence and complete logs: git-ignored `portal/private/ask-post-deploy-r3/`.
