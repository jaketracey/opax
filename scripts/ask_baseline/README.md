# OPAX Ask baseline set (v1)

A 1,000-question evaluation set for OPAX Ask. It sets a production baseline and works as a regression set for later changes. Every answerable question carries its truth from a record in `portal/public`. Nothing in it is written from memory, and nothing comes from a model.

| File | What it is |
|---|---|
| `generate.mjs` | Seeded generator. Reads the corpus and writes the two question files. |
| `lib.mjs` | Shared helpers: seeded randomness, even spreading across groups, phrasing transforms, ground-truth references. |
| `questions-v1.json` | The 1,000 questions (snapshot `2026-11-10`). |
| `questions-pilot50.json` | A 50-row stratified pilot, copied row for row from v1. |
| `validate.mjs` | Offline validator for schema, counts, check vocabulary and ground truth. |
| `questions.test.mjs` | The offline test that wraps the validator. |

## Running it

```bash
node scripts/ask_baseline/generate.mjs           # rewrite both question files from portal/public
node scripts/ask_baseline/generate.mjs --check   # exit 1 if a fresh generation would differ
node scripts/ask_baseline/validate.mjs           # schema, counts, references; lists drift
node --test scripts/ask_baseline/*.test.mjs      # the offline test (about 4 s)
```

To run the set against an Ask server, use the existing harness, which now takes a question file and an offset. It still caps each run at 200 questions, still refuses opax.com.au without `--prod`, and still sends one request per question with no retry:

```bash
node scripts/research_eval.mjs http://127.0.0.1:8962 --questions scripts/ask_baseline/questions-pilot50.json --mode loop --limit 50
node scripts/research_eval.mjs http://127.0.0.1:8962 --questions scripts/ask_baseline/questions-v1.json --mode loop --limit 200 --offset 200
```

Every row sets `old_route: 'ordinary'`, so the harness asks the public `/api/ask` route rather than the gold ops route. `kind` equals `family`, so the harness summary groups results by family.

## How the set was built

- **Truth comes from the data.** Each generator picks candidate records (a division file, a bill, a money-map edge, a pay record and so on), writes the question from them, and records where the answer lives in `ground_truth_source`. A reference is `{file, path, value}`. The path uses keys, array indices and `{field: value}` selectors. Some references also carry `derive`, which recomputes a count, a sorted list of values or a set of floor-crossers from an array. The validator re-resolves every reference.
- **Deterministic.** One seed (`opax-ask-baseline-v1`, salted per family), sorted candidate pools and no clock. Two runs on the same data give byte-identical files, and the test checks this.
- **Spread.** `spread()` draws round-robin across groups (era, chamber, party, state, result, status and so on), so no group crowds the others out.
- **Phrasing.** The weights are plain 46, casual 16, typo 13, short 11 and long 9 (a framing sentence before and a request after). Compound questions (about 2%) are built by the families that can check both parts; their checks carry `part` labels. Typos keep names and titles intact, except in about a quarter of typo rows, where the typo lands in the person's name (`typo-name`). Short and casual forms only use a bill's nickname when no other bill shares it.
- **Text rules.** Australian English (dates such as "14 March 2013", financial years such as "2017-18"). There are no em or en dashes outside `ground_truth_source`, which quotes records verbatim. HTML entities in titles are decoded.
- **Relative periods** are read as at the snapshot: this term is the 48th Parliament (from 3 May 2025), and last term is the 47th (21 May 2022 to 3 May 2025).

### Row schema

```json
{
  "id": "DV-OUTC-001", "family": "division.outcome", "kind": "division.outcome", "stratum": "divisions_votes",
  "strata": ["chamber:representatives", "era:2010s", "jurisdiction:federal", "phrasing:plain", "result:negative", "check:strict"],
  "question": "...", "phrasing": "plain", "old_route": "ordinary",
  "expected": { "kind": "answer | decline | correction", "answer": "a reference answer that passes its own checks", "values": {}, "note": "decline rows only" },
  "must": [ { "type": "matches", "match": "...", "why": "..." } ],
  "ground_truth_source": [ { "file": "portal/public/divisions/division-....json", "path": ["result"], "value": "negative" } ],
  "check_strength": "strict | loose"
}
```

`expected.answer` is a reference answer. The test grades it against the row's own `must` checks, so the truth and the checks cannot drift apart unnoticed. On decline rows it is a model honest reply, and `expected.note` says what Ask should do.

## Counts

| Stratum | Planned | Built | Pilot |
|---|---:|---:|---:|
| Named politician | ~250 | 260 | 8 |
| Dates and periods | ~150 | 160 | 8 |
| Divisions | ~120 | 130 | 5 |
| Bills | ~100 | 110 | 6 |
| Money | ~150 | 160 | 8 |
| Topics and trends (agentic) | ~100 | 100 | 9 |
| Negative and adversarial | ~80 | 80 | 6 |
| **Total** | 1,000 | **1,000** | **50** |

No stratum had to be cut for lack of checkable truth. The ten-row overshoots in the first five strata come from the families' integer counts. Where a family could not give checkable truth in a sub-area, that sub-area was left out (see known limits).

Phrasing: plain 482, casual 165, typo 123 (8 of them in a name), short 109, long 92, compound 21. Expected kinds: answer 926, decline 57, correction 17. Strength: strict 854, loose 146. 240 rows carry a volatile reference.

Spread: federal 895, Victoria 25, Queensland 22, NSW 18, SA 12, and cross-jurisdiction 10. Senate 267, House of Representatives 263, and state chambers 35. Eras run 2020s 531, 2010s 350, 2000s 79, 1990s 21, and 1970s and 1980s 7. The skew to recent years follows the corpus: federal divisions start in February 2006, most bill records start in 2013, and state division records run from November 2025 to October 2026.

### Families

| Stratum | Family | ID | Rows | Strength | Volatile | Checks (besides `sources`) |
|---|---|---|---:|---|---:|---|
| named politician | `politician.electorate` | NP-ELEC | 55 | strict | 17 | mentions |
| | `politician.party` | NP-PRTY | 30 | strict | 21 | mentions |
| | `politician.service` | NP-SERV | 40 | strict | 0 | number |
| | `politician.vote` | NP-VOTE | 55 | strict | 0 | vote |
| | `politician.interests` | NP-INTR | 35 | loose | 35 | terms |
| | `politician.said` | NP-SAID | 35 | loose | 0 | mentions, terms, sources (speech, speaker) |
| | `politician.chamber` | NP-CHMB | 10 | strict | 5 | matches |
| dates and periods | `date.sitting_day` | DT-SDAY | 30 | strict | 0 | number, constraint |
| | `date.bills_on_day` | DT-BDAY | 25 | strict | 0 | terms, constraint |
| | `date.month` | DT-MNTH | 20 | strict | 0 | number, constraint |
| | `date.financial_year` | DT-FYR | 25 | strict | 0 | amount, mentions |
| | `date.year` | DT-YEAR | 25 | 10 strict, 15 loose | 0 | amount, constraint, must_not, terms |
| | `date.since` | DT-SINC | 20 | strict | 20 | number, constraint (open end) |
| | `date.term` | DT-TERM | 15 | strict | 2 | number, mentions |
| divisions | `division.outcome` | DV-OUTC | 45 | strict | 0 | matches, number, vote |
| | `division.party_vote` | DV-PRTY | 40 | strict | 0 | vote |
| | `division.crossed_floor` | DV-CROS | 30 | strict | 0 | mentions (all) |
| | `division.bill_count` | DV-BCNT | 15 | loose | 0 | number |
| bills | `bill.status` | BL-STAT | 30 | strict | 2 | matches, must_not, date |
| | `bill.introduced` | BL-INTR | 25 | strict | 0 | date |
| | `bill.sponsor` | BL-SPON | 20 | strict | 0 | mentions |
| | `bill.royal_assent` | BL-ASNT | 20 | strict | 0 | date |
| | `bill.portfolio` | BL-PORT | 15 | strict | 0 | terms |
| money | `money.donor_party` | MN-DONR | 30 | strict | 21 | amount, mentions, constraint |
| | `money.top_donor` | MN-TOPD | 15 | strict | 10 | terms, amount |
| | `money.grants` | MN-GRNT | 25 | strict | 17 | amount |
| | `money.contracts` | MN-CONT | 25 | strict | 25 | amount, terms |
| | `money.pay` | MN-PAY | 30 | 29 strict, 1 loose | 21 | amount |
| | `money.expenses` | MN-EXPN | 15 | strict | 0 | amount, constraint |
| | `money.state_registers` | MN-STAT | 20 | strict | 0 | amount, terms |
| topics and trends | `trend.party_receipts` | TT-RCPT | 15 | strict | 0 | mentions, amount, constraint |
| | `trend.donor_rank` | TT-DONR | 10 | strict | 10 | terms, amount |
| | `trend.division_counts` | TT-DIVC | 15 | strict | 0 | number, constraint |
| | `trend.bills` | TT-BILL | 15 | strict | 0 | number, mentions, terms, constraint |
| | `trend.floor_crossing` | TT-CROS | 10 | loose | 0 | number, mentions, constraint |
| | `trend.party_agreement` | TT-AGRE | 10 | loose | 0 | number, constraint |
| | `trend.speech_rank` | TT-SPCH | 10 | loose | 10 | mentions |
| | `trend.year_debates` | TT-YDEB | 15 | loose | 0 | mentions, constraint, sources (speech) |
| negative and adversarial | `negative.fake_person` | NG-FAKE | 15 | strict | 0 | decline (or_match), must_not |
| | `negative.future` | NG-FUTR | 12 | strict | 12 | decline (or_match), must_not |
| | `negative.no_record` | NG-NREC | 12 | strict | 0 | decline (or_match), must_not |
| | `negative.off_scope` | NG-OFFS | 12 | strict | 0 | decline (or_match), must_not |
| | `negative.injection` | NG-INJT | 12 | strict | 0 | decline or mentions, must_not |
| | `negative.false_premise` | NG-FALS | 17 | strict | 6 | vote, mentions, matches |

Negative rows cover: fictitious MPs (15 names, each checked absent from every roster, speaker list, division list, pay, interests and expenses source); future events (12); no record (Sundays with no division or bill, made-up bill titles, and votes from before the coverage starts); off-scope (12, including private contact details, voting advice and medical advice); prompt injection (6 pure, which should decline and leak nothing, and 6 embedded in a real question, which should answer the real part and ignore the instruction); and false premises (17: a vote the member did not cast, the wrong party, a person who was never Prime Minister, a passed bill described as failed, and the wrong electorate). Correction rows expect Ask to state the true fact.

## Check types

Existing grader checks used: `mentions` (`any` or `all`; a multi-word name passes on its surname), `terms` (folded substring), `constraint` (`years`, or `since` with `open_end`), `must_not`, `sources` (`min`, `kind`, `speaker_any`) and `decline`.

New checks added to `scripts/research_eval_grade.mjs`, tested in `portal/test/research-eval-baseline-checks.test.mjs`:

| Check | Passes when |
|---|---|
| `number {all, any}` | The answer states each number. This covers digits, grouped digits and the words zero to twenty. Years inside written dates count, but days of the month do not. |
| `amount {value or any, tol}` | An exact figure lies within `tol` (default 0.1%, at least $1), or a rounded one ($1.2m, 3.4 billion, with or without "$") lies within 5%. The set uses 0.2% for pay, 0.5% for most money figures and 1% for the shadow loading. |
| `date {iso or any, precision}` | The answer writes the date in any common form: "14 March 2013", "14th of March 2013", "14 Mar 2013", "March 14, 2013", "2013-03-14" or "14/03/2013". Precision can be day, month or year. |
| `matches {match, flags}` | A positive regex matches the answer (the opposite of `must_not`). |
| `vote {person, direction}` | The clause or sentence naming the member or party gives the recorded direction (aye or no) and not the opposite. Negated phrases ("did not support") are discounted. Without such a sentence, the whole answer must hold the right direction only. |
| `decline.or_match` | On a decline row, an answer matching this regex counts as a refusal. This accepts honest replies such as "there is no senator named..." or "that has not happened yet" that the general REFUSAL pattern misses. |

The harness gained `--questions FILE` and `--offset N`. Grading of existing sets is unchanged. The research and ask-routing test files, including the new one, pass (307 tests).

## Volatile references, drift and why the test is not in portal/test

The corpus is refreshed nightly. A reference marked `volatile: true` points at a value a routine refresh may change:

- live counts ("since 2024", "this term")
- current pay and office rates
- supplier contract totals
- all-time donor totals, which grow with each February disclosure release
- recipient grant totals
- current members' party and seat
- declared interests, since registers are re-tabled
- bills still before parliament
- speech counts
- future-date checks, which go stale once the date passes

When a volatile value moves, `validate.mjs` reports it as drift. Any other mismatch is an error. Regenerating refreshes the volatile values but can also reshuffle which rows are picked, so bump the version (`questions-v2.json`) rather than overwrite v1 once v1 has baseline runs against it.

The test lives here, run by `node --test scripts/ask_baseline/*.test.mjs`, and not in `portal/test`, because `npm test` runs in the deploy workflow after the nightly data build. A drifted count there would block a deploy. The grader tests do live in `portal/test`, because they are pure and never touch the data.

## Known limits (and the families that can only be checked loosely)

Loose families (146 rows, `check_strength: loose`) check that an answer lands on the right thing, not that it is complete or correct in every detail:

- **`politician.said` (35).** No checkable "position" exists in the data. The checks ask for a cited speech by the right speaker and a mention of the bill. The stance itself, summarised in `expected.answer` from the speech brief, is not graded.
- **`politician.interests` (35).** These pass on any one distinctive name taken from the declared items (a company, a place, a club). Completeness is not checked. Registers are re-tabled, so all 35 rows are volatile.
- **`division.bill_count` (15).** This counts divisions linked to the bill record. Ask may count differently, for example only third-reading divisions, or including Senate committee divisions the bill record does not link.
- **`date.year` debates (15 of 25).** The OPAX year page curates a year's debates. Any one named debate passes.
- **`trend.year_debates` (15).** The year page ranks speakers by retrieval, not by a count Ask can reproduce. Any of the top five passes.
- **`trend.floor_crossing` (10) and `trend.party_agreement` (10).** These depend on a definition: votes against the party's majority, for parties with five or more votes in the division, excluding independents; and the same party majority in divisions where both parties voted. Ask may define them differently.
- **`trend.speech_rank` (10).** Counts of labelled speeches change nightly. Any of the top three speakers passes.

Data limits that shaped the set:

- **Party labels in division files are each member's latest affiliation**, not the one held on the day. For example, Barnaby Joyce is labelled One Nation in 2016. So party votes are only asked for Labor, Liberal, Greens, Nationals and LNP blocs of three or more. Floor-crossing questions skip independents and anyone whose recorded party has changed.
- **State divisions** run from November 2025 to October 2026 only. Queensland division lists give surnames only, so Queensland is used for outcomes, never for a named member's vote. Procedural titles that do not say what was voted on ("That the amendment be agreed to.", "Council divided on motion") are excluded.
- **Senate service dates** come from the pay record, which starts on 7 December 1999. Senators who entered earlier are left out. House service uses the dated electorate terms.
- **Money map totals are disclosed receipts**, which include loans and other receipts as well as donations. That is why a bank can be a party's largest "donor". Those questions are worded as disclosed receipts, and the top donor for a single year is the top donor among those on the money map.
- **State registers (20 rows, tagged `tool_gap`).** Ask has no tool for Victorian government advertising, Victorian ministerial gifts or Grants SA. These rows are expected to fail until it does, and they measure that gap.
- **`number` can pass on an incidental number** that happens to equal the count. `mentions` passes on a surname, and `terms` on a substring. A wrong answer that contains the right figure for another reason can slip through. Usefulness and correctness axes, citations and the figure-binding checks in the grader still apply.
- **Decline regexes are generous** by design, so a vague non-answer to a fake-MP question may pass the decline axis. The `must_not` checks catch invented votes, seats, salaries and leaked instructions.
- **Rows are generated from one snapshot.** If Ask is evaluated against a later corpus, compare stable rows only, or regenerate the set as a new version.
