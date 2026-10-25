# Receipt rankings: deterministic endgame

Round 5 replaces the rejected receipt-prose guard with routing before generation. This is a new commit on `web/ask-loans-receipts`; history is preserved. The implementation is rebuilt from audit baseline `3ed331fdf` plus the safe input, calculator, web and voice changes from the reviewed rounds. No push, deployment, production request or importer/classification work occurred.

Removed: `research-receipts.ts`, `receipt-language.mjs`, its declarations, all receipt sentence rewriting/deletion, the neutral-grammar/denylist checks, the uncited-fact repair search, the calculator exemption, the receipt wording tests and framing fixtures. General grounding, response/cache wrappers, writer, coherence, claim audit and ranking repair/scope files are byte-identical to the audit baseline. There are no receipt wording hooks in those JSON, SSE or cache paths. Their pre-existing factual and period checks retain baseline behaviour; no model sentence is rewritten or dropped for receipt wording.

Kept: directly generated receipts leads and the mixed-receipts sentence, canonical receipt follow-ups, overview facts and input instructions; `party_receipts` tool name/description/citation labels; neutral fact conversion (`PARTY disclosed $X in receipts from SOURCE`); `ranked_money` input copy; all reviewed web labels; and direct voice receipt wording plus the balance-owed-at-30-June lending limitation and citation for lend/lent/loan/loaned/borrow/owe/debt forms. The model receives receipt wording, without a new output filter. State calculator notes use the calculator's actual jurisdiction.

The closed family route resolves user question/history only, then calls the federal receipt calculator. It runs before model selection, paid overview generation, ordinary/agentic/research cache reads and final prose wrappers. Direct calculator, agentic, research-loop and operator-gold entry points share the same route. Party/year follow-ups use user turns, never generated answers or client amounts. Recognized family requests with incompatible speaker, chamber, topic or other record filters receive a deterministic scope clarification. State and non-family requests keep their existing path.

The calculator's public payload contains the full answer, ranking table, citations, source records, receipt context and follow-up question. `money_facts` is stripped before emission; no guard or routing decision depends on its presence in the emitted response. No `money_overview` model paragraph is generated for this family. SSE sends the completed calculator payload directly; cached model prose is never loaded for these requests.

| Review P1 | Endgame response | Test/evidence |
| --- | --- | --- |
| Calculator answer erased after `money_facts` removal | No final receipt guard or calculator exemption exists. The public calculator payload is emitted directly. | 282 real Worker responses: all 42 question wordings and four follow-ups, JSON/SSE, off/route/shadow, plus default speech-kind input. Full payloads match the calculator after internal fields are stripped. |
| 43 damaged post-drop answers | No receipt wording drops or repairs. The family answer is generated from the graph with its complete table. | Replay: 42 complete calculator answers; four explicit party/year data gaps with citations. No empty tables or orphaned name fragments. |
| Figure-free claims and garbling bypassed the prose guard | Input routing owns the answer; no model financial sentence is generated for the family. | Gives/funds/bankrolls/supports/props-up, donor/backer/supporter/benefactor forms, possessives, Hanson and follow-ups all use the calculator. |
| Missing catalog jurisdiction defeated enforcement | Family routing uses the federal graph calculator directly and does not inspect catalog-prose jurisdiction. | Direct agentic/research tests throw on any planner, writer or model-budget call; calculator results still succeed. Non-family catalog answers are covered by the residual risk below. |
| Unrelated citations or flags disabled enforcement | Neither model citations nor model payload flags enter family routing. | Poisoned cache test records zero cache reads and zero outbound/model requests for all 282 emitted responses. |

[Routing list](routing-list.md): 42 explicit wordings and four multi-turn controls, including the Hanson possessive form. Fourteen non-family controls retain their route. Existing ordinary-answer parity also verifies 192 unchanged JSON/SSE bodies.

Replay compares against the requested audit baseline, rather than the rejected Round 4 guard: **158 payloads; 46 family differences; 112 unchanged non-family answers and citation maps. Zero non-family changes.** Forty-two differences are complete calculator answers. Four are the One Nation 1990–91 and 2019–20 missing selections, each on both saved arms. Those gaps name the requested party and financial year, explain that absence from the selection does not establish no receipts, retain the mixed-receipts sentence and cite the selection. No amount is invented.

Every changed answer is listed with its reason in [replay-differences.md](replay-differences.md). All 46 complete before/after answers, including tables and citations, are in the ignored local report `portal/private/ask-receipts-round5/replay-full.md`. Existing private identities remain out of committed reports, fixtures and new test literals.

The five local controls pass the calculator contract: fixed gold leader/amount/count, independent graph row totals and record counts, full five-row tables, direct receipt lead, mixed-receipts sentence, public payload shape, per-row citations and valid citation spans; the lending control checks its debt-basis citation. No fresh model generation was used. Full answers are in `portal/private/ask-receipts-round5/answers.md`.

The old model-prose grader's raw result is retained: **1/5 pass**. Its four failures flag the required tables as tool output, parse digits in citation URLs as financial figures, and expect a prose ranking period in the first sentence. That rubric is unchanged. The separate calculator contract is **5/5 pass**; both results and every contract check appear in [eval-summary.json](eval-summary.json).

[Gates](gates.json): install first; build search before the full portal suite; TypeScript; `check`; deploy dry run; diff check. Generated build churn is restored before commit. All nine protected datasets are byte-identical to `3ed331fdf`; `votes.json` and `pay.json` also match original live commit `12ce00e22` ([hashes](data-integrity.json)). The calculation amounts and source data have not changed.

Recorded new model/eval spend: **US$0.00 of US$0.50**, with zero model-provider calls and zero production requests ([spend](spend.json)).

Residual risk: free-form non-family answers can still describe receipts loosely as giving, donations or support, even though their current inputs say receipts. In particular, the saved non-family donor-profile answers retain audit-baseline wording. This round deliberately adds no post-hoc wording enforcement to those answers. The federal export still cannot separate gifts from loans; importer retention of receipt type and classified export cells remains a separate future lane.

Changed paths are in [files.txt](files.txt).
