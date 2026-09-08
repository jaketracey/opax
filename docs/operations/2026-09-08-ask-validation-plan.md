# Ask validation sweep

## Purpose and release gate

Exercise realistic public questions against the deployed Ask endpoint, review retrieved evidence, fix reproducible failures, and verify the shipped release. The 44-case bench is `scripts/ask_regression_questions.json`; the runner is `scripts/ask_regression.py`.

## Coverage

- Everyday topics: housing, health, climate, banks, gambling, immigration, integrity, Indigenous affairs, tax, telecommunications, foreign affairs and media.
- Scope: named parliamentarians, parties, comparisons, explicit filters, natural-language dates and jurisdictions, misspellings and conversation follow-ups.
- Public money: disclosed receipts, individual versus party recipients, year-specific totals, contract awards and unsupported causation.
- Controls: nonexistent people and subjects, false premises, prompt injection.

## Method

1. Run the full bench with three concurrent requests against production, retaining question, request controls, status, latency, cache status, complete answer, citation ranges and sources in a new local run directory.
2. Automatically check nonempty responses, citation ranges and destinations, cited flags, expected retrieval scope, explicit date filters, visible provider syntax, and control outcomes. `CHECKED` means these checks passed. It never means the answer is factually certified. Keyword targets are review signals only. Do not excuse failures from guessed corpus age.
3. Read all answers. For each, assess whether it answers the question, limits its claims to the retrieved evidence, preserves chronology and source attribution, and uses financial terms correctly. Inspect cited excerpts and fetch original records where the excerpt is incomplete or a claim is questionable. A document indexed under an MP may contain other speakers.
4. Record reproducible defects with case IDs and add focused tests. Validate changed cases locally against the actual provider, then run the unit/type/build checks.
5. Merge, deploy, repeat the full production bench and review changed answers. Exercise streaming and citation navigation in the browser. Record remaining limitations honestly.

Raw model outputs stay in the chosen local run directory. Commit the question bench, runner, tests and reviewed findings. Do not treat a HTTP 200, keywords or a citation marker as proof of factual accuracy.

## Commands

```sh
python3 scripts/ask_regression.py --out /tmp/opax-ask-baseline --workers 3
python3 scripts/ask_regression.py --base http://localhost:8791 --out /tmp/opax-ask-local --only named-wilkie natural-dates followup-funding
python3 scripts/ask_regression.py --out /tmp/opax-ask-release --workers 3
```
