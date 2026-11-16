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

* `use`: how each listed source's text may be used.
  * `documents_only`: listed and linked. No text is indexed, quoted, excerpted or summarised.
  * `search_only`: text may be indexed privately to locate a hearing and page. It is never sent
    to a language model, summarised or excerpted. No private index is built yet, so today this
    behaves as `documents_only` everywhere a reader or a model could see text.
  * `quotable`: text may be searched, quoted with attribution and sent to a model.
  A key is a source id (a commission id such as `vic-major-infrastructure`, or a knowledge base
  `source` label or origin source id) or a document id; a document entry overrides its source.
  A source that is not listed is governed by its own pipeline's rules and treated as quotable;
  hearing transcript text is published only for a source listed as `quotable`.
* `withheld`: the takedown list. Each entry is exactly a `source` or a `document`, a `reason`
  (`publisher_request`, `legal_order`, `withdrawn` or `amended_pending`) and a `date`. No other
  field is accepted, so the list cannot itself disclose what was suppressed. A document id is a
  knowledge base slug (`speech-123`) or `<source id>/<document key>`
  (`vic-major-infrastructure/transcript-2026-11-09`).

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
| Knowledge base pushes (every path) | `KbClient.create_resource`, `patch_resource_by_slug` in `parli/arag.py` | Refuses to write a withheld or non-quotable source or document |
| Knowledge base sync | `parli/ingest/arag_sync.py` | Deletes what the list names before any push (`purge_withheld`), and never pushes or queues it |
| Transcript full text | `scripts/build_transcript_fulltext.py` | Builds text only for a source listed `quotable`; skips a withheld transcript |
| Published files | `scripts/apply_source_policy.mjs` (first step of `npm run build:search`; `--check` in `npm run check`) | Rewrites the royal commission records and removes transcript text, index rows and postings, with no PDFs needed |
| Royal commission build and export | `parli/ingest/royal_commissions.py`, `scripts/export_royal_commissions.py` | Holds if a non-quotable source carries a quotation; checks dates and names on the page without keeping its words |
| Report summaries | `scripts/report_summaries/prepare.py`, `scripts/build_report_catalog.mjs` | Never prepares a withheld or non-quotable report for summary; a summary whose file is withheld is left off |
| Search catalogue | `scripts/build_search_catalog.mjs` | A withheld record keeps its title and label; nothing of it is searchable |
| Ask retrieval, search, the resource API, MCP `read_record`, corpus tools | `portal/src/source-policy.ts`, called by `kbFetch` and `corpusKb` | A query excludes withheld sources and documents; a response loses any closed resource; a record read is a listing row |
| `royal_commissions` tool and transcript text | `portal/src/tools/royal-commissions.ts`, `transcript-text.ts` | Applies the policy to the record as read; no excerpt, page hit, finding or recommendation from a closed source |
| Tool results handed to Ask and MCP clients | `callTool` in `portal/src/tools/index.ts` | A row or citation naming a withheld record is reduced to its title and label |
| Enrichment (summaries and topic labels) | `enrich/src/policy.ts`, `discover.ts` | Never queues, reads or writes to a closed resource |

Tests: `tests/test_source_policy.py`, `portal/test/source-policy.test.mjs`,
`enrich/test/policy.test.ts`. Each adds an entry and asserts nothing leaks.

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
* The integrity, annual and agency report datasets are not keyed by this list yet. To withhold
  one of those documents, remove it in its own ingest and follow steps 4 to 7.
* Until step 4 is deployed, cached copies of an answer or a record can still be served for up to
  seven days.
