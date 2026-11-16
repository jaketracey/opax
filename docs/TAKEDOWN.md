# Takedown: withholding a source or a document

How OPAX amends, withdraws or suppresses something it holds, and what the code enforces. The
reader-facing version is the "Takedown" section of [/terms](https://opax.com.au/terms#terms-takedown).

Contact: **support@opax.com.au**. A person reads the request and acts on it the same day.

## What OPAX can and cannot do

OPAX acts when it is told, or when a maintainer sees that a publisher has changed, withdrawn
or restricted a document. **There is no automatic check of a publisher's site yet**: the weekly
refresh does not detect an amended or withdrawn document.

Stated plainly:

* **The exclusion works at retrieval.** Once an item is on the list and deployed, searches and
  Ask's lookups cannot return it, so it cannot enter a new answer.
* **Streamed answers are not filtered on the way out.** Nothing inspects the words of an answer
  as it streams. The protection is that the item was never retrieved.
* **Cached answers are cleared by the cache epoch bump.** Until the bump is deployed, a cached
  answer, search or record can still be served for up to seven days.
* **Copies saved in a reader's browser or on their phone cannot be recalled.**
* **Copies saved to a member's account on OPAX's server can be removed** (step 6).
* Other sites' and search engines' copies are theirs. The engines that take part in IndexNow
  are told which pages changed after the deploy.

## The list is private

**The withheld list's real contents are never public.** This repository is public, and an
entry that names a document, or an id that resolves to one, can itself disclose that an order
exists. So the repository holds the schema, the loaders and an empty example
(`parli/ingest/withheld.example.json`), and nothing else.

**Never write an identifier** of a withheld item (its id, slug, title, link or the reason) in a
tracked file, a commit message, a pull request, an issue, a ticket, a chat or a cache epoch
name. Work in a terminal on the maintainer's own machine.

The store is one small JSON text, the same in every place:

```json
{ "schema": 1, "withheld": [ { "document": "<id>", "reason": "legal_order", "date": "2026-11-16", "mode": "hide" } ] }
```

Each entry is exactly a `source` or a `document`, a `reason` (`publisher_request`,
`legal_order`, `withdrawn`, `amended_pending`), a `date` and an optional `mode`. No other field
is accepted. A `document` is any knowledge base slug (`speech-…`, `press-…`,
`bill-text-…`, anything), a report slug (`integrity-report-…`, `agency-report-…`,
`annual-report-…`, `royal-commission-…`) or `<commission id>/<document key>`. A `source` is a
commission id, or a knowledge base `source` label or origin source id.

`mode` decides what a reader sees. The reason never does.

* `list_only` (the default): the item keeps its title and date with one neutral line, the same
  for every reason, **"Not available on OPAX. Open the publisher's copy."**, and a link to the
  publisher. No text, snippet, summary, page count, hash or file link.
* `hide`: the item is not listed at all, and a request for it is answered exactly as one for an
  item OPAX never held. Use it when the document's existence is itself the subject of an order.

Only the mode leaves the loaders. The reason and date stay in the store, for the maintainer's
record. No log line, status field, error message or response repeats an entry; errors about the
store say only that it is unreadable.

### Where the store lives, and who can change it

A Worker secret is the simplest thing that works for the Workers (no new binding, it takes
effect when it is set, and staging has its own); an Actions secret reaches the build; a private
file serves the Python jobs that run on one machine. Only the maintainer, who holds the GitHub
repository's secrets, the Cloudflare account and the refresh box, can add an entry.

| Place | Read by | Set with |
| --- | --- | --- |
| GitHub Actions secret `OPAX_WITHHELD_JSON` | The Deploy workflow: applies the list to the built files, and puts the same value into the portal Worker's secret, in one run | `gh secret set OPAX_WITHHELD_JSON < withheld.json` |
| Portal Worker secret `OPAX_WITHHELD_JSON` | Every request: search, Ask retrieval, the resource and report APIs and pages, MCP tools | Set by the Deploy workflow. For effect within seconds, also `npx wrangler secret put OPAX_WITHHELD_JSON` in `portal/` (add `--env staging` for staging) |
| Enrichment Worker secret `OPAX_WITHHELD_JSON` | Summaries and topic labels | `npx wrangler secret put OPAX_WITHHELD_JSON` in `enrich/` |
| `~/.config/opax/withheld.json` on the refresh box, mode 600 | Every Python knowledge base job: the nightly sync, the purge | Edit the file; `chmod 600` |

They are kept in step by hand, from one file on the maintainer's machine, and checked by
digest: a 16-character hash of the entries that shows no entry and no count.

```
python3 -m parli.source_policy                                    # the refresh box (and your own file)
curl -s -H "authorization: Bearer $DAILY_POST_OPERATOR_SECRET" https://opax.com.au/api/ops/withheld-digest
curl -s -H "authorization: Bearer $ENRICH_ADMIN_TOKEN" https://<enrich worker>/withheld-digest
```

All three must print the same digest. The build has no digest of its own: it receives the
Actions secret, and the same run sets the portal Worker's secret from it.

What happens when one is behind or broken:

| Consumer | No store | Store set but unreadable | Behind the others |
| --- | --- | --- | --- |
| Portal Worker | Nothing withheld | **Fails closed.** `/api/*`, `/mcp`, `/doc/*`, `/report/*` and `/official-reports` answer 503 "OPAX is temporarily unavailable. Please try again shortly." Other pages are served | Serves the item through search, Ask and the record routes until its secret is set |
| Enrichment Worker | Nothing withheld | **Fails closed.** No tick runs; admin routes answer 503 | May summarise or label the item until its secret is set |
| Deploy build | Nothing withheld | **Fails closed.** The apply step fails and nothing is deployed | Static files (`/royal-commissions/`, `/transcripts/`, `/integrity-reports/`, `/agency-reports/`, `/annual-reports/`, report records, the search catalogue) still hold the item until the next deploy. The Worker cannot filter a static file |
| Python jobs on the refresh box | Nothing withheld | **Fails closed.** Every knowledge base client refuses to start | The nightly could push the item back into the knowledge base. The Workers would still not return it |

So: the portal Worker's secret protects everything served through code at once; only a deploy
changes static files; and the refresh box file is what stops the item being pushed again.

## What honours the list

| Consumer | Where | What it does |
| --- | --- | --- |
| Knowledge base pushes (every path) | `KbClient.create_resource`, `patch_resource_by_slug` in `parli/arag.py` | Skips a withheld item without a word and returns an ordinary result, so no log or error marks it |
| Knowledge base sync | `parli/ingest/arag_sync.py` | Deletes what the list names before any push, silently; `--purge-withheld` is the operator's command |
| Published files at deploy | `scripts/apply_source_policy.mjs`, run by `scripts/withheld_overlay.sh` in the Deploy workflow | Rewrites royal commission records, transcript text, and integrity, agency and annual report data; never committed |
| Report records and the search catalogue | `scripts/build_report_catalog.mjs`, `scripts/build_search_catalog.mjs` | The neutral row, or no row |
| Search, Ask retrieval, the resource API, MCP `read_record`, corpus tools | `portal/src/source-policy.ts`, called by `kbFetch`, `corpusKb`, `apiUnifiedSearch` | A query excludes the item; a response loses it; a read is the neutral row or "not found" |
| Report API and pages | `withheldReport` in `portal/src/report-records.ts` | The neutral record, or "not found" |
| Tools (`royal_commissions`, the report tools, all others) | `callTool` in `portal/src/tools/index.ts`; `royal-commissions.ts`, `transcript-text.ts` | A row or citation naming the item is dropped or reduced to its title and the notice |
| Enrichment | `enrich/src/policy.ts`, `discover.ts` | Never queues, reads or writes to it |

Committed outputs (the commission export, transcript text files) are built from the public tiers
alone and never read the store, so the repository's history cannot show an item being removed.
The use tiers are a separate, public part of the policy: see "Use tiers" below.

Tests supply a fake entry through the private path and assert that nothing gets out and that
no row, response, log line or error names it: `tests/test_source_policy.py`,
`portal/test/source-policy.test.mjs`, `enrich/test/policy.test.ts`.

## Runbook

A takedown is **not done until the epoch bump and the deploy have both run and been checked**
(steps 3 and 4).

1. **Private stores first.** Add the entry to your `withheld.json`. Then, in this order:
   * `npx wrangler secret put OPAX_WITHHELD_JSON < withheld.json` in `portal/`. From this moment
     search, Ask, `read_record` and the record pages stop returning the item.
   * `gh secret set OPAX_WITHHELD_JSON < withheld.json`
   * `npx wrangler secret put OPAX_WITHHELD_JSON < withheld.json` in `enrich/`
   * copy the file to the refresh box as `~/.config/opax/withheld.json`, `chmod 600`
2. On the refresh box: `uv run python -m parli.ingest.arag_sync --purge-withheld --dry-run`,
   read what it would delete, then run it without `--dry-run`. This deletes the document, or
   every resource of the source, from the knowledge base. Do not paste its output anywhere.
3. **Bump the cache epoch.** `python3 scripts/bump_cache_epoch.py <date>-refresh` (a neutral
   name), commit ("Cache epoch") and merge. The new epoch retires OPAX's cached answers,
   searches, record bodies and share cards, and starts an IndexNow run for the pages that changed.
4. **Deploy.** The Deploy workflow is dispatched on the merged commit:
   `gh workflow run deploy.yml --ref main`. It builds, tests the public build, applies the list
   to the built files, sets the Worker secret, deploys, reloads the tables and returns the
   working tree to the public build before committing the restamp.
5. **Check**, all of them:
   * the three digests match;
   * the item's page shows the neutral line and the publisher link only, or "not found" in
     `hide` mode;
   * search, Ask and `read_record` return no text from it;
   * `curl -s https://opax.com.au/api/display-policy` answers (the Worker is serving) and the
     Deploy run is green.
6. **Member copies on OPAX's server.** A signed-in member's saved conversations are rows in
   `member_chats` in the `opax-community` D1 database. Count, then delete, the rows whose stored
   sources cite the item:
   `npx wrangler d1 execute opax-community --remote --command "SELECT COUNT(*) FROM member_chats WHERE instr(data, '<the item's link or slug>') > 0"`,
   then the same with `DELETE FROM member_chats WHERE …`. This removes the whole saved
   conversation for those members. Copies on their own devices are not reached.
7. Reply to the person who asked, saying what was done and what OPAX cannot reach.

To lift a takedown, remove the entry and repeat steps 1, 3 and 4. To clear the list, store
`{"schema":1,"withheld":[]}` rather than deleting the secrets.

## Live test on staging (hub-approved; not yet run)

Run once after #461 is deployed to staging, with a throwaway resource of harmless test text.
Nothing here is committed: the entry goes into the staging Worker's secret only. Staging reads the
same knowledge base as production, so the probe is also visible to production search until step 5
deletes it; never leave it in place.

```
# 0. names for this run (a new slug every time; never reuse another lane's probe)
# The slug must be one the resource API and read_record accept, so it borrows the speech-<number> form with a
# number far above any real speech; its labels say it is a test.
SLUG="speech-99$(date -u +%s)"; S=https://staging.opax.com.au
PHRASE="opax takedown probe $(date -u +%s) lorem ipsum test sentence"
# 1. create the resource (refresh box, knowledge base credentials in .env)
time uv run python - <<PY
from parli.arag import AragConfig, KbClient, load_dotenv
load_dotenv(); kb = KbClient(AragConfig.from_env())
kb.create_resource({"slug": "$SLUG", "title": "OPAX takedown probe (test record)",
  "texts": {"body": {"body": "$PHRASE. This is a test record with no meaning. " * 8, "format": "PLAIN"}},
  "origin": {"source_id": "opax-test"},
  "usermetadata": {"classifications": [{"labelset": "kind", "label": "research_report"}, {"labelset": "source", "label": "opax-test"}]}})
PY
# 2. confirm staging returns it (repeat until indexed; note the time taken)
time curl -s "$S/api/resource/$SLUG?nocache=1" | head -c 300
time curl -s "$S/api/search-all?nocache=1&q=$(printf %s "$PHRASE" | jq -sRr @uri)" | head -c 400
time curl -s -X POST "$S/api/ask" -H 'content-type: application/json' -d "{\"question\":\"What does the record say about: $PHRASE?\"}" | head -c 600
#    read_record: call the MCP tool at $S/mcp with {"slug": "$SLUG"}
# 3. withhold it on staging only
printf '{"schema":1,"withheld":[{"document":"%s","reason":"publisher_request","date":"%s"}]}' "$SLUG" "$(date -u +%F)" > /tmp/withheld-staging.json
(cd portal && time npx wrangler secret put OPAX_WITHHELD_JSON --env staging < /tmp/withheld-staging.json)
# 4. confirm it is gone (the three commands of step 2, and read_record); time each
# 5. purge: dry run, then real, with the same store on the refresh box for this command only
time OPAX_WITHHELD_JSON="$(cat /tmp/withheld-staging.json)" uv run python -m parli.ingest.arag_sync --purge-withheld --dry-run   # must list exactly $SLUG
time OPAX_WITHHELD_JSON="$(cat /tmp/withheld-staging.json)" uv run python -m parli.ingest.arag_sync --purge-withheld             # {"deleted": 1, "absent": 0}
uv run python - <<PY
from parli.arag import AragConfig, AragError, KbClient, load_dotenv
load_dotenv(); kb = KbClient(AragConfig.from_env())
try: kb.get_resource_by_slug("$SLUG"); print("STILL THERE")
except AragError as e: print("gone", e.status)
PY
# 6. clean up: clear the staging secret and the temporary file
printf '{"schema":1,"withheld":[]}' | (cd portal && npx wrangler secret put OPAX_WITHHELD_JSON --env staging); rm /tmp/withheld-staging.json
```

Measured times: **to be written here after the run** (create to searchable; secret set to
excluded in search, Ask and `read_record`; purge dry run; purge).

## Use tiers (public)

`parli/ingest/source_policy.json` gives each listed source a record. `CAPABILITIES` in the two
loaders is the only place that says what a tier allows.

| Tier | Indexed | Quoted | Model writes about it | In the knowledge base |
| --- | --- | --- | --- | --- |
| `documents_only` | no | no | no | no |
| `search_only` | privately, to point to a hearing and page | no | no | no |
| `quote_and_cite` | yes | yes, short and attributed | no | no |
| `full` | yes | yes | yes | yes |

* `quote_and_cite`: Ask shows the passages, each with its speaker, page and citation, then
  "These are from hearing transcripts: evidence, not findings." The writer model is never given
  them. `search_only`: no private index is built yet, so it behaves as `documents_only`.
* `summaries: "allowed"`: machine summaries and topic labels. Off for every listed source
  unless its record says so; needs `full`. Only the three CC BY commissions have it.
* `kb_generation: "allowed"`: the source may reach a path where the knowledge base itself
  generates text. Off unless the record says so; needs `full`.
  `vic-major-infrastructure` can never have it.
* `hosts`, `names`: how a record, fact, link or earlier answer is recognised as the source's.

A commission's own `use` field is written by its build (`parli/ingest/royal_commissions.py`),
and a test keeps the registry and this file in agreement. A source that is not listed is
governed by its own pipeline's rules and treated as `full` with both flags on.

### Knowledge base generation

The older Ask engine, its planner, follow-up rewriting, suggested follow-ups, search summaries,
position recovery, journey stories, the money overview and the South Australian `/predict/chat`
path ask the Progress knowledge base to generate text, through an OpenRouter preset this code
cannot set. A source reaches them only at `full` with `kb_generation: allowed`. It is kept out
twice: `kbFetch` filters the knowledge base's own retrieval on every `/ask`, and records,
passages, facts and earlier answers that name a closed source are dropped where each request is
assembled. The reader's own question and turns are sent as typed.

### Election guard, until 6pm on 28 November 2026 (Melbourne)

Nothing from `vic-major-infrastructure` may appear on, or be linked from, the Victorian election
hub, seat and region pages, candidate content or share cards. OPAX sends no newsletter.
`portal/test/source-tiers.test.mjs` is the rule; it may be removed after the polls close.

## Known limits

* The query filters for a withheld knowledge base source (`origin_source`) and document
  (`resource` by slug) follow Progress's published filter syntax and have not yet run against
  the live knowledge base. The staging test above is where they first will.
* The Deploy workflow steps that apply the list and set the Worker secret have not run: no
  secret exists yet. With a list in force a deploy takes longer, which is visible in the public
  run; nothing else about the list is.
* Withholding a whole commission in `hide` mode leaves fixed caveat wording that names the three
  CC BY commissions.
* The crawl pages and sitemaps follow the report records and the catalogue; a knowledge base
  document's own crawl entry, if it has one, is not separately checked.
* For `quote_and_cite`, a stray uncited sentence by the research loop model is not caught by a test.
* The only transcript text index is the public files under `/transcripts/`, built for CC BY
  sources. A source that is not CC BY needs a private index before it can leave `documents_only`.
* The build machine keeps the publisher PDFs it was given. A withheld document's PDF, and any
  text cached before 16 November 2026, are deleted there by hand.
