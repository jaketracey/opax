# Ask fix round 4, 13 October 2026

Main `a3e70b1f6991ddf70e8895c593cf8e9496feab36` is merged first. The reviewed baseline is `aa931dbe19d0cf882ba269bcf095cd2542a6859d`. While the desktop gate ran, main advanced to `dfe0c6298243bfa8590ea8cefcc93854b21317bf`, including the Ask no-answer contract and page-performance fixes; that main is also merged before final validation.

The scope detector recognizes number words, compound quantities, numeric quantities and ordinals, and ranking modifiers. Explicit person slots accept these only as part of a complete collective phrase; unresolved lowercase people still decline before planning, counting or cache access. Roster resolution and cache entity identity are unchanged.

The app script's closing tag is restored. The shell is restamped. Compared with main, `index.html` differs only in the two intended step-loader containers and content hashes for the changed app and generated shell. A JSDOM regression compares every parsed script, including its attributes and inline text, with main and explicitly checks that `/analytics.js` is a separate script.

`portal/test/agentic-fix4.test.mjs` adds four regression groups:

- R07 and five more ranking phrasings, plus collective person slots containing number words, numeric ordinals and ranking words.
- The full R01–R10 gold sample: **10/10** answered using synthetic tool rows and stubbed planner responses.
- Actual Worker JSON/SSE for all ten gold questions and the six ranking phrasings: **30/30** successful responses, zero normal-Ask fallbacks, real step frames in SSE.
- Parsed script and shell parity against main, ignoring content hashes and the two intended loader containers.

All four groups fail on the reviewed code before the fixes. The merged targeted suite passes **77/77** (63 agentic tests plus 14 no-answer tests), including all round-3 lowercase/cache-order regressions and **96/96** byte-identical ordinary JSON/SSE bodies against current main, with zero planner calls. Every service response in these tests is offline and stubbed. Fallback regression fixtures now return deliberate structured declines; the no-answer suite uses an empty fixture catalog rather than generated production exports.

The first desktop gate passes **1,654/1,654** at `2045857bf`, followed by passing Mac check and dry-run. After merging the newer main, the desktop full-suite gate runs again from an isolated worktree through `gate/agentic-fix4` and `~/opax-work/web-tests-desktop.sh`. `npm run check` and `npx wrangler deploy --dry-run` run on the Mac after it. The final SHA and gate counts are reported at completion; the desktop worktree retains `.gate-test.log`.

No main push, live deployment or remote migration is performed. `votes.json` remains byte-identical to main.
