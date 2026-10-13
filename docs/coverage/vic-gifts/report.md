# Victorian ministerial gifts and hospitality

Checked **14 October 2026 (Australia/Sydney)**. Branch `coverage/vic-gifts` starts
from `origin/main` at `d390b2f94b71f7b4d86db245ae466a49fb6834da`. The final commit SHA
is supplied in the handoff. Acquisition, data, code and QA are local to this
worktree. No production KB, D1, live JSON, push or deploy.

## Inventory and staged rows

The [DPC index](https://www.vic.gov.au/ministerial-gifts-benefits-and-hospitality-register)
links **three HTML period pages**, each with a minister table and a parliamentary
secretary table. No register download files are linked on those pages. This is a
bounded inventory of the published ministerial series at this snapshot, including
the parliamentary-secretary equivalents. Agency employee gifts and parliamentary
ordinary returns remain different series. The index identifies February–June 2025
as the first publication; earlier ministerial periods are not fabricated.

| Published reporting period / original | Format | Ministers | Parliamentary secretaries | Rows | Licence |
| --- | --- | ---: | ---: | ---: | --- |
| [1 February–30 June 2025](https://www.vic.gov.au/2024-25-ministerial-register-gifts-benefits-and-hospitality) | HTML, two tables | 69 | 15 | 84 | CC BY 4.0 website grant, exceptions reviewed |
| [1 July 2025–31 January 2026](https://www.vic.gov.au/ministerial-register-gifts-benefits-and-hospitality-july-2025-january-2026) | HTML, two tables | 110 | 25 | 135 | CC BY 4.0 website grant, exceptions reviewed |
| [1 February–30 June 2026](https://www.vic.gov.au/ministerial-register-gifts-benefits-and-hospitality-february-june-2026) | HTML, two tables | 56 | 7 | 63 | CC BY 4.0 website grant, exceptions reviewed |
| Total | Three period pages / six tables | 235 | 47 | **282** | |

[Inventory](../../../data/staged/vic-gifts/inventory.json),
[per-period registers](../../../data/staged/vic-gifts/registers/),
[staged web projection](../../../data/staged/vic-gifts/hub.json).

Every row retains the official holder and portfolio, giver and description as
published, period, source URL, table/row position, snapshot and SHA-256. Whitespace
is normalised; source spelling and annotations remain. The pages have no separate
date, estimated-value or action columns, so those fields are null in **all 282
rows**. Dates mentioned in descriptions remain part of the description. Totals
count entries; they are not estimated gift values or counts of individual gifts.
The February–June 2026 page expressly says its portfolios reflect 15 April–30 June
2026, rather than today's ministry. Donor addresses are omitted from staged rows
and the product; original HTML is retained as a source snapshot.

**275 rows** link to an existing, unique Victorian roster person by exact name,
after whitespace/case normalisation and removal of the literal Hon/The Hon title.
**Seven rows remain unlinked:** six early-period entries include return-form
annotations, and one July–January entry duplicates part of the holder's name.
Neither annotation stripping nor fuzzy matching is used. These are identity holds
on the link, not withheld source rows. Private givers are plain source strings:
no profiles, links, search entities, graph nodes or identity joins are created.

## Licence scope and source access

The period pages link the [publisher copyright notice](https://www.vic.gov.au/copyright).
Its opening ownership sentence names material produced by the Department of
Government Services. The subsequent licence grant covers all website material,
with images/branding and third-party exceptions. The
[disclaimer](https://www.vic.gov.au/disclaimer) describes DGS as the site owner on
behalf of the Victorian Government. DPC's register index identifies DPC as the
publishing department; the pages carry State Government attribution and no
table-specific exception.

The recorded interpretation is that the grant applies to DPC's State Government
register text on this same website: the DGS ownership sentence does not restrict
the subsequent website-material grant to DGS-authored pages. This does not grant
rights to separate Parliament documents, third-party attachments, branding or
images. Each period's licence finding records this scope, the exceptions and the
copyright receipt. A narrower grant, missing licence link, restricted notice or
unsupported source layout holds the whole period before row extraction. Serving
checks the document licence and row provenance again.

Required attribution is **© Copyright State Government of Victoria**. The page
identifies whitespace normalisation and arrangement by period, and states that no
endorsement is implied. No table-specific licence holds were found in this run.
Future source snapshots require a fresh licence/exception review.

[Receipts](../../../data/staged/vic-gifts/receipts.json): **eight serial requests,
all HTTP 200**, comprising robots, copyright, register index, DPC owner page,
disclaimer and three period pages. Each retains source URL, timestamps, identifying
OPAX user agent and identity hash, body hash and original bytes. Robots was checked
first. The two wildcard groups are combined, including the two-second crawl delay
and document-file disallows; request-start gaps were all at least 2.1 seconds.
No redirects, proxies, archives, challenges or alternative acquisition paths were
used. **No 403s or challenges occurred.**

| Period | SHA-256 of original HTML |
| --- | --- |
| February–June 2025 | `b1fcc52785ca8d10701512dc584c3be1b548d812f0d6e53a31e661c0327fd76c` |
| July 2025–January 2026 | `a45e306fa5dd8db79b8179acb7dce13a43b8966aa43cdb12c72a198466e82257` |
| February–June 2026 | `4718a88e1490979dc54292096f003aaa1849edbc110caa8de399b2d4a3b2e8ba` |

## Local surfaces and promotion

`/register/vic-gifts` renders periods, office-holder entry totals and the shared
DataTable on the server, using design tokens. Period selection, role facets,
official-field search, sorting, pagination, column choices and CSV export use the
existing shared table contract without changes to the core. Search covers only
office holder, portfolio, role, period and a separately published date. Giver,
description and action wording remains within entries and is excluded from search.
CSV retains the source, table/row locator, snapshot, hash and licence.

Existing Victorian person pages gain a sourced register section in both server
HTML and the application renderer. Only exact existing roster matches qualify.
The register and each person/total/table block include source and licence receipts.
[390 screenshot](vic-gifts-390.png), [1440 screenshot](vic-gifts-1440.png),
[390 viewport](vic-gifts-390-viewport.png), [1440 viewport](vic-gifts-1440-viewport.png),
[browser evidence](browser-results.json).

[App plan](app-plan.md): place gifts alongside interests in the declarations feed
and on existing Victorian person screens. No app code or contract changes.

**All 282 rows are held from production pending the reviewed nightly path.** The
default register returns a sourced 503 until a reviewed `/vic-gifts/data.json`
asset exists. Local QA substitutes the staged file through an in-memory asset
binding; the staged projection is never copied into public assets. Source
publication is twice yearly, aligned to Parliament's ordinary-return cycle. A
future scheduled acquisition should use a fresh dated staging directory, reconcile
the linked periods and retained revisions, and apply the same source/licence guards.
No production refresh step is activated by this lane.

## Validation

Parser and source-access tests: **8 passed**. Portal-specific tests: **7 passed**,
including real Worker route dispatch, serving-boundary licence/hash rejection,
search exclusion, exact official links, person blocks and hydrated search.
The first full-suite attempt ran before ignored release fixtures were generated:
1,848 passed, 45 failed and 3 skipped, with missing search/crawl/hub fixtures. That
attempt is retained as a failure; a release build and complete rerun follow it.

Final desktop suite: **1,968 passed, zero failures or skips**, with
`OPAX_TEST_HOST=::1`. TypeScript, `check`, release build, staging dry run (all staged
files byte-identical) and Worker deployment dry run passed. The ordinary desktop
clean loopback namespace was used for runtime types, check and the suite.
[Validation receipt](validation.json).
Browser checks cover 390/1440 with zero overflow or page errors, all three period
counts, official search (32 entries), excluded giver search (zero hits), paging,
CSV receipts, JavaScript-disabled table/totals and the actual person-page section.

`votes.json` stays byte-identical to the initial `origin/main` snapshot, schema 1;
SHA-256 `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.
