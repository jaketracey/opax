# Round 7: long-tail family phrasing

Parent: `2cb03ca1d`. This change reads and normalises questions only. It adds no model-prose rewriting, dropping, boundary filter, importer work or number changes. No provider/model calls, push, deployment or production requests were made. Provider spend: **US$0.00**.

Normalisation covers case, straight/curly apostrophes, plural party possessives, both meanings of “who's”/“whos”, “who've”, and “teh”. Keyword and party/alias matching uses Damerau-Levenshtein distance: one edit for short words, two for words with at least seven letters; adjacent transpositions count as one edit. Multiword party aliases have a total two-edit budget. Longest party aliases take precedence over nested shorter names; equal best matches across parties request clarification.

Confident matches call the existing receipts calculator. Ambiguous financial grammar or party matches return a deterministic `needs_scope` question, such as “Do you mean the largest disclosed receipts to Labor?” They never enter a model or cache. JSON, SSE, direct calculator, agentic, research-loop, voice and bounded follow-up entry points share this decision. No amount or citation is invented in a clarification.

Known topic, sender-filter, comparative, historical-membership, period, pay, grants/contracts and lending requests keep their existing paths. This preserves the original 24 negatives and 10 new near-miss negatives, existing party-identity/period handling, disclosure links and the debt-basis limitation. Ambiguous history stays a clarification for bounded money follow-ups; a new housing/speech question returns to ordinary Ask.

Coverage:

- **252 R7 generated checks, including 249 new unique wordings** beyond the previous 612. All 252 route to the calculator. The grammar covers 120 plural-possessive checks, 54 “who's/whos been” checks, 36 “who've” checks, 30 keyword-spelling checks and 12 party-spelling checks. Three baseline control wordings also appear in the spelling group.
- **34 primary negatives**: all original 24 plus 10 new near misses, including “most popular Labor policy”, “who funds the ABC” and “Greens' top priorities”. None routes to federal money.
- Five separate uncertainty fixtures clarify without reading assets: reordered grammar, an uncorrectable financial verb, joined typo “tehmost”, ambiguous keyword “fundes”, and the ambiguous party alias LAP.
- **20 new real Worker JSON/SSE responses** cover the five exact reproductions and five uncertainty fixtures. Poisoned caches record zero reads, and the offline harness records zero outbound/model calls. Public payloads match the deterministic payload exactly.
- Direct agentic and research entry points, uncertain follow-ups, eight new voice cases and the “Who loaned the most money to Labor?” debt-basis control pass.

Gates: `npm ci` first; build search before the full portal suite; **3,744 tests**; TypeScript; `npm run check`; Wrangler deploy **dry run only**, with metrics disabled. Final command results are in [gates.json](gates.json). Generated JSON churn is restored before commit. All nine protected datasets remain byte-identical, including `votes.json` and `pay.json`; see [data-integrity.json](data-integrity.json).

Replay: **158 saved payloads** against local `origin/main` (`7b5a0e471`). **112 non-family payloads are byte-identical to main**. The existing **46 family responses** remain 42 calculator rankings (200 table rows) and four explicit party/period gaps. **All 158 outputs are also byte-identical to the reviewed Round 6 replay**: zero incremental replay differences. [Every difference from main](replay-differences.md) and [machine-readable summary](replay-summary.json).

Full generated questions and counts are in [coverage.json](coverage.json); changed files are listed in [files.txt](files.txt). Raw saved answers, identities and detailed logs stay under ignored `portal/private/ask-receipts-round7/`.

The accepted residual risk remains: free-form requests outside the closed financial-ranking family can still word receipt inputs loosely. This release adds no post-hoc model-prose guard.
