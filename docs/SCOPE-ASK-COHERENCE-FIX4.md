# Ask coherence fix 4: fail-closed ranking repair

Parent: `d52548812445b22b0444778093f5a0328fb6e219`.
Review: `/Users/jake/Projects/opax-ios/.ops/codex-runs/review-ask-coherence-r4.last.md`.

## Allowlist

The question reaching the final boundary is the existing rewritten standalone question. Only these complete forms can grant donor reconstruction permission:

1. `who gives/gave/donates/donated the most [money] to <party>`
2. `top donors to <party>`
3. `which company gives/gave/donates/donated the most [money] to <party>`
4. `who does <party> take the most money from`

The party slot accepts one existing alias, optionally preceded by `the`. This includes One Nation/Pauline Hanson's party and LNP/Liberal National Party. The last form preserves the exact Hanson question.

Each form optionally accepts one `in YYYY` or `in YYYY–YY` period and one `in <jurisdiction> [disclosures]` suffix, in either order. Jurisdictions use the existing federal/state/territory aliases; federal remains the default. The bare state suffix preserves the Queensland donor gold. Case, whitespace, apostrophe/dash typography and one terminal question mark or full stop are normalized.

Every remaining token must be consumed by those slots. Individual/person qualifiers, date ranges, `between`, `since`, `most years`, `per year`, another party, negation, chamber wording and other extra words cannot grant repair permission. Duplicate suffixes fail. Resolved request filters cannot add a period, chamber or entity restriction absent from the form.

The old scope parser receives no new qualifier rules. It remains an additional evidence check after the allowlist; it cannot grant permission itself.

## Exact evidence matching

- Party and jurisdiction must match the slots and the resolved constraints.
- A company form requires typed company/corporation evidence. Generic forms accept only known allowed donor types. Recognized selected tool donor rows carry the `donor` relationship type; explicit unknown types fail. Names never establish a company or person subtype.
- An explicit bare year matches that bare year; an explicit FY matches the full FY. Repair no longer uses a year-prefix comparison. Multi-year aggregates support only forms without a period.
- Permission still requires an original audited, rejected AUD claim, bound by its citation and amount to the selected matching fact. A figure-free decision or an unrelated rejected amount cannot authorize repair.
- The deterministic donor fallback and lead repair use the same gate. The generic money renderer cannot recreate a donor ranking after that gate rejects it. An inadmissible writer repair requests a retry; the final boundary preserves checked points beside a limitation rather than serving a runner-up fragment.

The existing pay headline guard retains a checked pay answer prepared before writing if a later revision loses its required subject. This reuse is restricted to the existing canonical pay-row format. Donor answers do not receive this bypass, and writer refusals/clarifications stay protected.

## r4 reproductions and regression tests

The initial test-first run had **155 tests, 85 failures**. The final allowlist file has **174 passing tests**. All three review reproductions run through the relevant JSON/SSE × ordinary/fallback × fresh/cache combinations:

- `Who is the largest individual donor to One Nation in federal disclosures?` cannot reconstruct Westpac from the saved Hanson evidence or from explicitly company-typed evidence. The rejected figure loses its citation.
- The explicit `2019-01-01` to `2019-06-30` interval stays `date:2019-01-01:2019-06-30`; it cannot match 2019–20 evidence or grant reconstruction.
- Typed `2019-07-01` to `2021-06-30` correctly normalizes to `fy:2019-20:fy:2020-21`, matching the evidence's `2019–20 to 2020–21`. The range question still cannot grant reconstruction because ranges are outside the allowlist.

Ten additional wordings, each blocked on all eight paths, remain coherent and have no orphan citation:

1. Who gives the most money to One Nation between 2019 and 2021?
2. Who gives the most money to One Nation since 2019?
3. Who gives the most money to One Nation in most years?
4. Who gives the most money to One Nation per year?
5. Who gives the most money to One Nation and Labor?
6. Who does not give the most money to One Nation?
7. Who gives the most money to One Nation excluding companies?
8. Who usually gives the most money to One Nation?
9. Show the largest reliable individual donor to One Nation.
10. Please show the top donors to One Nation?

All six saved donor golds, including the Hanson and Queensland questions, permit repair on all eight paths. Exact company/type/year/FY controls and hidden-filter vetoes also pass. Earlier jurisdiction, ownership, refusal, clarification, salary and selected-source controls remain covered.

Earlier positive tests for broader wording now retain the original wording as a veto control and add the canonical allowed FY form as a positive control. Old direct-verifier pay/speech repairs now require a retry instead of emitting a fragment. FOLLOW-PAY is strengthened to force two mock writer passes and verify that a second revision cannot lose John Howard and his cited amount.

Focused writing/coherence/loop/ownership tests: **907/907**.

## Offline replay: every difference

| Population | r4 arm | B arm | Sentence, citation-key/range or grade differences versus parent |
|---|---:|---:|---|
| Original questions | 50 | 50 | None |
| Donor golds | 6 | 6 | None |
| Follow-up turns | 23 | 23 | None |
| Total | 79 | 79 | **None across 158 payloads** |

Both previous saved boundary outputs and original paired finals were replayed through the parent and new code, with network access replaced by a throwing function. All 158 remain idempotent. Original raw-payload migrations inherited from previous rounds, including GOLD-M03, are unchanged.

B coherence remains **79/79**: original 50/50, donor 6/6 and follow-up 23/23. All blocked new boundary controls are coherent limitations; no replay case loses repair. Donor golds remain 6/6, follow-ups 23/23, conversations 10/10, dates 23/23 and audit findings zero. Original correctness 39/6/5 and declines 48/50 remain unchanged; this round does not claim to resolve those earlier limitations.

Private evidence: `portal/private/ask-coherence-fix4/{replay.json,raw-replay.json,invariants.json}` and the test/gate logs. No Ask or provider request was made.

## Gates

- Build search first, then full portal suite: **3,350/3,350**, no failures or skips.
- `tsc --noEmit`, `npm run check` and the local Wrangler dry run pass.
- `votes.json` and `pay.json` are byte-identical to the parent.
- The claim audit remains identical to names-only `8954ed767`; all six financial functions have no diff against live r4 `31e00250a`.
- No deadline, reserve, rate-limit, model configuration or claim-plan flag change.
- No production request, model call, push or deployment. New spend: **US$0.00**.
