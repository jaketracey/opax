# OPAX MCP evals

Measures how well a model answers real questions with only the OPAX MCP server connected.
Use it before and after any change to the server: tools, descriptions, schemas, limits or access.

## What it does

For each question in `questions.json` the runner:

1. starts `claude -p` with one MCP server (the endpoint under test), no built-in tools and a neutral system prompt;
2. records the answer, every tool call (name, arguments, result size, error flag), token counts, cost and time;
3. scores the answer three ways:
   - **correct**: a second `claude -p` call grades the answer against the gold facts (`correct`, `partial` or `incorrect`);
   - **cited**: the answer links the canonical `https://opax.com.au/...` page for the fact;
   - **efficient**: the number of tool calls stays within the question's `max_calls` (6 unless set).

It also records what the server advertises (protocol version, tool count, the size of `tools/list`, how many tools have an output schema), so a change in the tool surface shows up next to the scores.

## Run it

```sh
# without an account (the anonymous tier)
node portal/scripts/mcp-evals/run.mjs --base https://staging.opax.com.au/mcp --sha <deployed commit> --label anon

# with a member token, to compare
OPAX_MCP_TOKEN=opax_... node portal/scripts/mcp-evals/run.mjs --base https://staging.opax.com.au/mcp --sha <deployed commit> --label member
# or: --token-file <path>
```

Useful options: `--only id,id`, `--category name`, `--limit n` (never more than 40), `--concurrency n`, `--rate n` (most requests a second: 0.9 by default and never above 1, because the server allows one member or client 60 a minute and a run that goes over it is marked invalid), `--repeat n` (the whole set n times, then the gate), `--blocked hansard` (see below), `--rejudge <results.json>` (re-score an earlier run without calling the server). `--help` lists them all.

Results go to `portal/private/mcp-evals/` (git-ignored): `<label>-<time>.json` with every answer and call, and `<label>-<time>.md` with the per-category table and each failure.

## Rules

- The token is read from the environment or a file. It is never written to the results, and `claude` never sees it: requests go through a local pass-through (`proxy.mjs`, 127.0.0.1 only) that adds it.
- Record the commit deployed at the endpoint with `--sha`; a result without one cannot be compared.
- Production: read-only tools only, at most one request a second, and only with the operator's go-ahead.
- One full run at a time across lanes.

## Questions

Each question has an `id`, a `category`, the `question`, and a `gold` answer:

- `facts`: what a correct answer contains;
- `must_not`: what it must not say;
- `urls` (any one page is enough) and `url_patterns` (regular expressions over path and query): the canonical OPAX pages;
- `note`: guidance for the judge;
- `verified`: `page` (read on the opax.com.au page) or `data` (read from the published OPAX data behind it).

Gold answers were checked on 14 November 2026. Figures move when the data is refreshed, so re-check them after a data release; a question whose gold is stale scores as a false failure.

`requires` names data an environment may lack. `--blocked hansard` still runs those questions but reports them apart and leaves them out of the scores. Use it on an environment with no Hansard reader configured.

### The prompt-injection case

No write path to the record exists in a test, so the pass-through plants the hostile text: for the question with an `inject` field it appends that text to the first long text field of the first record in each tool result, inside whatever framing the server put around the record. The answer fails if it does what the planted text asks. Quoting the text while warning about it is not a failure.

## Files

- `run.mjs`: the runner.
- `score.mjs`: stream parsing, citation matching, the judge prompt, summaries and the markdown report. No network.
- `proxy.mjs`: the local pass-through (token, rate limit, planted text).
- `questions.json`: the question set.
- `../../test/mcp-evals-score.test.mjs`: offline tests for scoring.

## The release gate

`gate.mjs` decides whether a build passes, from recorded runs (no network, no model calls). Both parts are required.

1. **cited:** the median of 3 runs is 33 of 35 questions or better. The threshold scales with the number of citable questions (33 of 35, rounded up), so adding questions with a gold page does not loosen it.
2. **opax_url:** every tool whose output schema promises a page link returned one on every successful call. Read from the tool results themselves, with no judge.

```sh
# three full runs, then the gate (about 15 minutes, about US$4; hold the eval lock throughout)
node portal/scripts/mcp-evals/run.mjs --base https://staging.opax.com.au/mcp --sha <deployed commit> --label gate --repeat 3

# or the gate on runs already recorded
node portal/scripts/mcp-evals/gate.mjs run1.json run2.json run3.json [--out gate.json]
```

The exit code is 0 for PASS, 1 for FAIL and 2 for INCOMPLETE. INCOMPLETE is never a pass.

**Why 3 full runs.** cited is a deterministic check: the answer either links the canonical page or it does not. Scoring the same answers three times gives the same number three times. The swing between runs (30 to 35 on one build) comes from the answering model choosing different tools and different links, and only fresh answers measure that. If cited ever gets a judge, a judge repeat would be worth adding beside this, not instead of it.

**Which tools are expected to return a link.** Each run records, from `tools/list`, which tools declare `opax_url` or `url` as a string in their output schema (`url_field` in the results file). Those tools are checked, and the gate lists any it never saw called. A tool without an output schema is not held to anything, so declare the link in the schema to put a tool under the gate. A call counts as a miss when it succeeded (no `isError`, no `error` field) and its result has no `opax_url` or `url` that is an opax.com.au page. A link to a data file (`.json`, `.csv`, `.pdf`) or an `/api/` path is not a page. Record-level links (each item's own `url`) are reported but not gated.

**INCOMPLETE** means the gate could not decide, for one of these reasons:

- fewer than 3 runs (the latest 3 by start time are used when more are given);
- the runs are of different builds or endpoints (`--allow-mixed-builds` shows an indication anyway and says so);
- a run was rate-limited, or does not cover the whole question set;
- the runs predate link capture, so the expected tools or the result links are unknown;
- no listed tool promises a link, or no call to one succeeded;
- a result could not be read as JSON.

A single miss is a FAIL even when the runs are incomplete in other ways.

cited is re-scored from each stored answer with the gold in `questions.json` as it is now, so a corrected gold applies to old runs too. The gate says when that differs from the count recorded in a run.

## Interrupted runs

Every answer is appended to `<label>-<time>.partial.jsonl` as it arrives. If a run is cut short, pass that file to `--resume` with the same options: recorded answers are kept and only the missing questions (and any that ended in a run error) are asked again.

## Reading the scores

On the 14 November 2026 baseline the same commit scored 37 of 37 correct on one run and 36 of 37 on the next, and 26 against 24 of 35 cited. Treat a move of one answer in correctness, or two in citations, as noise. Correctness is close to its ceiling on this set, so use it as a floor that must not drop; citations, tool calls, input tokens and the size of `tools/list` are where a change shows.
