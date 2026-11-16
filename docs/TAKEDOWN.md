# Takedown: withholding a source or a document

How OPAX amends, withdraws or suppresses something it holds, and what the code enforces. The
reader-facing version is the "Takedown" section of [/terms](https://opax.com.au/terms#terms-takedown).

Contact: **support@opax.com.au**. A person reads the request and acts on it the same day.

## What OPAX can and cannot do

OPAX acts when it is told, or when a maintainer sees that a publisher has changed, withdrawn
or restricted a document. **There is no automatic check of a publisher's site yet**: the weekly
refresh does not detect an amended or withdrawn document.

OPAX can withhold the document on its own site, app and MCP service, clear its own caches and
remove the document from its knowledge base. It cannot recall a copy of an answer already saved
on a reader's own device, and it cannot change another site's or a search engine's copy. Search
engines that take part in IndexNow are notified of the changed pages after the deploy.

## One file

`parli/ingest/source_policy.json` holds two things.

* `sources`: one record for each listed source, keyed by its id (a commission id such as
  `vic-major-infrastructure`, or a knowledge base `source` label or origin source id).
  * `use`: one of four tiers. `CAPABILITIES` in the two loaders is the only place that says what
    a tier allows; no other code names a tier.

    | Tier | Indexed | Quoted | Model writes about it | In the knowledge base |
    | --- | --- | --- | --- | --- |
    | `documents_only` | no | no | no | no |
    | `search_only` | privately, to point to a hearing and page | no | no | no |
    | `quote_and_cite` | yes | yes, short and attributed | no | no |
    | `full` | yes | yes | yes | yes |

    `quote_and_cite`: Ask may find and show passages, each with its speaker, page and citation,
    followed by the line "These are from hearing transcripts: evidence, not findings." The
    writer model is never given the passages, so no account of the evidence is written in a
    model's words. `search_only`: no private index is built yet, so today it behaves as
    `documents_only` wherever a reader or a model could see text.
  * `summaries: "allowed"`: machine summaries and topic labels (the enrichment Worker, report
    summaries). Off for every listed source unless its record says so; needs the `full` tier.
    Only the three CC BY commissions have it.
  * `kb_generation: "allowed"`: the source may reach a path where the knowledge base itself
    generates text (see below). Off unless the record says so; needs the `full` tier.
    `vic-major-infrastructure` can never have it (`KB_GENERATION_NEVER`): the loader refuses a
    file that sets it, in every tier.
  * `hosts`, `names`: the publisher's host names and the source's own name, so that a record, a
    fact, a link or an earlier answer can be recognised as the source's wherever a request is
    assembled. Required for `quote_and_cite`.

  A key may also be a document id holding only `use`, which overrides its source. A source that
  is not listed is governed by its own pipeline's rules and treated as `full` with both flags
  on. Public transcript text files are built only for a CC BY source listed as `full`.
* `withheld`: the takedown list. Each entry is exactly a `source` or a `document`, a `reason`
  (`publisher_request`, `legal_order`, `withdrawn` or `amended_pending`) and a `date`. No other
  field is accepted, so the list cannot itself disclose what was suppressed. A document id is a
  knowledge base slug (`speech-123`) or `<source id>/<document key>`
  (`vic-major-infrastructure/transcript-2026-11-09`). A `legal_order` entry withholds the whole
  transcript, as every reason does.

A withheld document shows as a listing row: its title, date, the label ("Withheld at the
publisher's request", "Withheld: subject to a legal order", "Withheld: withdrawn by the
publisher" or "Withheld: an amended version is pending") and a link to the publisher. No text,
snippet, summary, page count, hash or file link.

Loaders: `parli/source_policy.py` (Python) and `parli/ingest/source_policy.mjs` (the Workers
and the Node builds). They apply the same rules and are tested against each other. A malformed
file stops every reader.

## What honours it

| Consumer | Where | What it does |
| --- | --- | --- |
| Knowledge base pushes (every path) | `KbClient.create_resource`, `patch_resource_by_slug` in `parli/arag.py` | Refuses to write a withheld source or document, or one below the `full` tier |
| Knowledge base sync | `parli/ingest/arag_sync.py` | Deletes what the list names before any push (`purge_withheld`), and never pushes or queues it |
| Transcript full text | `scripts/build_transcript_fulltext.py` | Builds public text only for a CC BY source listed `full`; skips a withheld transcript |
| Published files | `scripts/apply_source_policy.mjs` (first step of `npm run build:search`; `--check` in `npm run check`) | Rewrites the royal commission records and removes transcript text, index rows and postings, with no PDFs needed |
| Royal commission build and export | `parli/ingest/royal_commissions.py`, `scripts/export_royal_commissions.py` | Holds if a source whose tier allows no quotation carries one; checks dates and names on the page without keeping its words |
| Report summaries | `scripts/report_summaries/prepare.py`, `scripts/build_report_catalog.mjs` | Prepares and shows a summary only where the record says `summaries: allowed`; a summary whose file is withheld is left off |
| Search catalogue | `scripts/build_search_catalog.mjs` | A withheld record keeps its title and label; nothing of it is searchable |
| Ask retrieval, search, the resource API, MCP `read_record`, corpus tools | `portal/src/source-policy.ts`, called by `kbFetch` and `corpusKb` | A query excludes withheld sources and documents; a response loses any closed resource; a record read is a listing row |
| `royal_commissions` tool and transcript text | `portal/src/tools/royal-commissions.ts`, `transcript-text.ts` | Applies the policy to the record as read; an excerpt, finding or recommendation only where the tier allows quotation |
| Ask's writer | `portal/src/research-writer.ts`, `research-writing.ts`, `research-loop.ts` | A `quote_and_cite` fact never reaches the writer model: its passages are shown as they stand, attributed, with the fixed line. Every transcript fact carries a typed attribution (speaker, page, evidence not finding) and the writer's contract carries the attribution rule |
| Knowledge base generation paths | `guardKbGeneration` and `openForKbGeneration` in `portal/src/source-policy.ts`; `buildAskBody`, `apiFollowups`, `moneyOverview`, `apiJourneyStory` in `src/index.ts`; `summarySources` in `src/search-summary.ts`; `rewriteFollowUp` in `src/ask-rewrite.ts` | See "Knowledge base generation" below |
| Tool results handed to Ask and MCP clients | `callTool` in `portal/src/tools/index.ts` | A row or citation naming a withheld record is reduced to its title and label |
| Enrichment (summaries and topic labels) | `enrich/src/policy.ts`, `discover.ts` | Never queues, reads or writes to a resource that is withheld, below the `full` tier, or from a listed source without `summaries: allowed` |

Tests: `tests/test_source_policy.py`, `portal/test/source-policy.test.mjs`,
`portal/test/source-tiers.test.mjs`, `enrich/test/policy.test.ts`. Each adds an entry or moves a
source between tiers and asserts nothing leaks.

## Knowledge base generation

Several features ask the Progress knowledge base to generate text: the older Ask engine
(blocking and streamed, and the reasoned position answer), its planner, follow-up rewriting,
suggested follow-ups, search summaries and their repair, position recovery, journey stories and
the money overview. That generation reaches a model through an OpenRouter preset whose routing
this code cannot set, so a source reaches those paths only at the `full` tier with
`kb_generation: allowed`, and `vic-major-infrastructure` never does. It is kept out twice:

* **At retrieval.** `kbFetch` adds a filter to every generation request, so the knowledge base's
  own retrieval for that request cannot return a resource labelled with a closed source.
* **Where the request is assembled.** Catalogue records, passages, facts and earlier answers that
  name a closed source (by id, host or name) are dropped before the prompt is built. An answer
  drawn from a closed source gets no suggested follow-ups. The reader's own question and earlier
  turns are theirs and are sent as typed. `kbFetch` checks supplied context and earlier answers
  once more as the request leaves.

The Ask research loop and its writer call OpenRouter directly with no-train routing (PR #458) and
are governed by the tier, not by this flag.

## Election guard, until 6pm on 28 November 2026 (Melbourne)

Nothing from `vic-major-infrastructure` may appear on, or be linked from, the Victorian election
hub, seat and region pages, candidate content or share cards. OPAX sends no newsletter.
`portal/test/source-tiers.test.mjs` renders the hub and all 96 seat and region pages, reads the
election data and sources and three share cards, and fails on any reference to the commission's
id, host or name. The test is the rule; it may be removed after the polls close.

## Runbook

1. Add the entry to `withheld` in `parli/ingest/source_policy.json`. Use the id, a reason class
   and today's date; write nothing else about the document anywhere in the repository, the
   commit message included.
2. `node scripts/apply_source_policy.mjs`, then commit the changed files.
3. On the machine with the knowledge base credentials:
   `uv run python -m parli.ingest.arag_sync --purge-withheld`. This deletes the document, or
   every resource of the source, from the knowledge base. Every later sync does the same before
   it pushes anything.
4. Bump `CACHE_EPOCH` and `INDEXNOW_EPOCH_VERSION` in `portal/wrangler.jsonc` and run
   `npm run deploy` in `portal/`. The deploy rebuilds the search catalogue, report records and
   crawl pages from the applied files. The new epoch retires OPAX's cached answers, searches,
   record bodies and share cards, and starts an IndexNow run for the pages that changed.
5. Run `npm run deploy` in `enrich/` so the enrichment Worker carries the new list.
6. Check: the document's row shows the label and the publisher link only; Ask, search and
   `read_record` return no text from it.
7. Reply to the person who asked, saying what was done and what OPAX cannot reach.

Known limits, stated plainly:

* The query filters for a withheld knowledge base source (`origin_source`) and document
  (`resource` by slug) follow Progress's published filter syntax and have not yet been used
  against the live knowledge base, because the list has had no entry. Step 3 does not depend on
  them: once a resource is deleted it cannot be retrieved.
* A streamed answer generated by Progress is not inspected on its way through; it relies on the
  query filter and on step 3.
* A model in the Ask research loop reads tool results in order to choose passages. For a
  `quote_and_cite` source the writer never sees them, a point that quotes one becomes a record
  selection and the model's own points are dropped; a stray uncited sentence by the loop model is
  not caught by a test.
* The only text index for transcripts is the public files under `/transcripts/`, built for CC BY
  sources. A source that is not CC BY needs a private index before it can be `search_only`,
  `quote_and_cite` or `full`; moving its tier alone publishes and indexes nothing.
* The integrity, annual and agency report datasets are not keyed by this list yet. To withhold
  one of those documents, remove it in its own ingest and follow steps 4 to 7.
* Withholding a commission that has loaded recommendations removes them from its file. The
  refresh's shrink guards (`scripts/vm/validate_data.py`, `--allow-shrink` on the build and
  export) will hold the next refresh until a maintainer accepts the drop.
* The build machine keeps the publisher PDFs it was given (`<cache>/manual/`), to count pages
  and check hashes. For a source whose tier allows no quotation the build stores no extracted text. Text
  cached before 16 November 2026 (`<cache>/text/<sha256>.json`) and the PDF of a withheld
  document have to be deleted there by hand.
* Until step 4 is deployed, cached copies of an answer or a record can still be served for up to
  seven days.
