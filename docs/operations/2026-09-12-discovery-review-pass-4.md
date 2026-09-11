# Discovery review — pass 4, 12 September 2026

This pass checks whether a reader can follow a named politician's documented proposals through a conversation. It also fixes a mobile interaction failure found while clicking through those questions. Enrichment and provider settings are unchanged.

## Production failures reproduced

The browser sends earlier questions with `author: "user"`, while scope inference read only `author: "question"`. After a Hanson housing question, “And what about immigration?” returned other speakers' passages. “What cap did she propose?” returned an unrelated Deborah O'Neill answer. A direct immigration-position control also returned an evidence gap despite a published proposal. Baseline responses took 12.53–45.59 seconds.

## Changes and adversarial review

Both existing context formats now contribute user questions. Answer text cannot establish a speaker filter. Follow-ups retain the named speaker while allowing the reader to change the topic, replace a date window, or switch to another person or party. Person names mentioned as the object of a question do not change its subject. Explicit filters still take precedence. Exact roster matching avoids interpreting short historical names such as On and Lim as parts of ordinary words.

Resolved named-speech questions and follow-ups use the original-first-speaking-turn evidence path introduced in pass 3. Retrieval keeps the topic and requested detail; generation also receives the latest question separately. Each summary point must cite a single original speech, keeping details from different dates apart. The verified-quote fallback preserves adjacent conditional sentences and cannot substitute a generic proposal for an unanswered cost, reason or duration question.

A separate adversarial review identified topic carry-over, subject/object confusion, historical person-switch contamination and a duration-fallback loophole. These cases now have regression coverage. The useful controls are Hanson's approximately 130,000 annual immigration cap and Pocock's housing-rent proposal with both percentage limits and the lower-of condition. These are recorded proposals, not predictions or claims about enacted policy.

The real mobile click-through also found that the voice launcher covered the text composer's Ask button. While the chat is visible, the launcher now clears the composer and accounts for the on-screen keyboard height. Other page layouts retain their existing positioning.

## Validation

- 388 portal tests passed, including browser-format context, person/topic/date changes, missing requested details, source boundaries and preserved policy conditions.
- TypeScript, asset stamps and all four jurisdiction graph smoke checks passed.
- Nine captured-response UI replays passed at 390, 768 and 1440 pixels, including a real click on Ask, source expansion, overflow and browser-error checks. These replays test presentation, not a fresh model response.
- Local generated responses were checked against original resource text, speaker metadata and source dates. All four cited originals in the final local sample matched. The subsequent single-source-per-point restriction closes the cross-date combination observed in that sample.
- Fresh production browser questions and original-source readbacks are required after deployment; release results are archived separately in `release-verified.json`.

Reproducible questions: `scripts/ask_discovery_followups.json`. Working evidence: `/tmp/opax-discovery-pass4`. Persistent evidence: `/Users/jake/.cache/opax/discovery-reviews/pass-4-20260912`.

## Limits and next passes

Scope resolution uses explicit language patterns and will not understand every elliptical conversation. Original metadata or undetected speaker boundaries can still be wrong; a bounded retrieval window cannot establish that a politician has no position. Exact excerpts do not formally prove every paraphrase or preserve every unstated implication. Missing requested details remain an evidence gap rather than an inferred answer.

The remaining two scheduled passes focus on funding-comparison scope and clearer mobile discovery. No additional enrichment model calls or queue changes were made in this pass.

## Production follow-up

PR #138 fixed browser scope and the mobile interaction. The three fresh browser requests passed source-identity and citation checks in 9.4–15.4 seconds. Reviewing their content still found a release defect: the cap summary added an eight-year citizenship condition absent from its supporting excerpt and included a second, unrelated immigration policy. Structural citation success was not accepted as answer verification.

The follow-up rejects numeric details absent from the quoted evidence (including small written-out numbers), requires cap/limit answers to cite a corresponding limit, and preserves a quoted lower-of condition in the summary. A rejected draft can still use the exact original proposal, without another generation attempt. Named-position caches receive a new version; general Ask and funding caches remain unchanged. The suite now contains 394 tests.

These checks remain conservative and do not prove semantic entailment. In particular, matching numbers alone cannot establish every qualitative claim, and broader wording or number spellings can lead to an evidence fallback. Fresh post-fix responses must still be reviewed against the originals.

A second live check exposed a shared-source edge case: two points citing one speech shared an aggregate excerpt list, so a rejected cap point could leave cap evidence attached to another surviving policy point. Position recovery now keeps and validates each point against its own quotations, requires the answer itself to address the requested limit, and removes excerpts belonging to rejected points. General search-summary output retains its existing shape. Two regression cases reproduce the shared-source failure and verify citation cleanup.

The final numeric check also keeps source dates out of policy quantities: August (08) in a source date must not validate an eight-year waiting period. A matching year is allowed only in a temporal phrase such as “in his 2026 bill speech.” A dated production-shaped regression reproduces this leak.
