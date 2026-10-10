# Source access

Jake's approved decision, 10 October 2026: all OPAX source requests identify
themselves with the single identity in `parli/ingest/user-agent.json`. No browser
identity, access-control workaround or proxy fallback is permitted. Python,
async downloads, shell transports, Node builds, the portal RSS reader, enrichment
requests and the watchdog share that file. Automated browsers are restricted
to OPAX UI tests; the demo recorder is paused and its recordings are retained.
Polite source intervals remain; seconds and HTTP-date Retry-After are honoured.

These sources are paused from this change's first run. Honest requests to the
parliamentary hosts on 10 October returned HTTP 403. Existing records, caches and published files are
kept. Permission requested; the outreach tracker is outside this repository.

| Paused source | Data that stops refreshing | Last available evidence | Permission requested from |
| --- | --- | --- | --- |
| ParlInfo | Committee transcripts, witness attendance, bills, bill text, explanatory memoranda, digests, indexed releases and reports | Published committee coverage through 2026-10-08; bills export 2026-10-04, latest introduction 2026-09-17. Local attendance snapshot fetched 2026-09-06. | APH / Parliamentary Library: direct access for the identifying agent |
| APH House register and index | Discovery of changed House statements, including statements linked to the refused APH API | Latest published source date 2026-10-07; interests export 2026-10-09 | APH: direct index and statement access |
| APH Senate register and detail pages | Senate declarations and alterations | Latest published source date 2026-10-08; interests export 2026-10-09 | APH: direct HTML access |
| APH member list | The historical APH roster verification snapshot; this was a manual acquisition, not an executable nightly fetcher | Documented member-list snapshot 2026-09-04; roster export 2026-10-04 | APH: direct member-list access |
| Queensland Parliament data API | New Queensland Hansard discovery and API member information | Published Hansard coverage through 2026-09-16 | Queensland Parliament: direct API access |
| SA Hansard | New South Australian Hansard | Published coverage ends 2024-11-12; already refused before this change | SA Parliament: direct Hansard access |
| Queensland lobbyist contact log | New contact-log entries; registration pages are separate | On 2026-10-10 the old URL returned 404; the current activity page returned 200 with a script-loaded grid and no static records. No successful snapshot receipt is available here. | Queensland Integrity Commissioner: permission requested for a direct, identifying data endpoint |
| Google Fonts regeneration (`--fonts`, optional build step) | Replacement of the bundled WOFF2 subsets; ordinary asset stamping continues | Honest CSS request returned 200 but only TTF on 2026-10-10; existing WOFF2 files are retained | Google Fonts: a permitted direct WOFF2 distribution path; permission requested |

The local read-only DB snapshot predates the published exports. Export dates,
source dates and fetch receipts above are different measures; a current export
does not prove a recent successful fetch. A more recent live fetch receipt is
unavailable here. Other sources continue using the honest identity; any new
403/401 or challenge page pauses that source immediately, before its response
can overwrite data. Static APH PDFs remain eligible for direct access, but the
paused index prevents automatic discovery of changed statements.

All executable Firecrawl calls were removed. Its documentation describes
`basic` as standard proxies and omitted proxy settings as automatic escalation;
an honest identity without proxies could not be established. See the
[proxy documentation](https://docs.firecrawl.dev/features/enhanced-mode) and
[advanced guide](https://github.com/firecrawl/firecrawl-docs/blob/main/advanced-scraping-guide.mdx).
The legacy `fetch_senate_firecrawl.py` filename now invokes direct HTTP only.
Historical documentation is retained with the access decision marked as superseded.

Refusal logs say `source paused: honest agent refused (awaiting permission)`.
Exit 4 means preserved source data, never a successful staged acquisition.
Daily and weekly runners exclude it from failures and skip dependent applies.
The VM nightly retains published files, continues other work, lists
`Paused sources:` in its summary and includes `paused_sources` in status JSON.
Source receipts live under the pipeline's `source-access/` directory; standalone
fetchers use `source-access.json`. No refusal deletes a source's last good data.

The full repository match inventory and dispositions are in
[SOURCES-ACCESS-AUDIT.md](SOURCES-ACCESS-AUDIT.md).

## Review correction and rollback

The review correction removes the remaining contact-log browser path, tightens
the repository guard and challenge detection, preserves incomplete font fetches,
and shows retained source dates. Every review mutation is reproduced in
`tests/test_source_guard.py` inside a temporary repository, without executing it.

From a clean checkout, these exact commands revert only the correction:

```sh
git switch ops/honest-agent
opax_review_sha=$(git log -1 --format=%H --grep='^Close source-access review gaps$')
test -n "$opax_review_sha"
git show --stat "$opax_review_sha"
git revert "$opax_review_sha"
```

That revert re-enables contact-log browser fetching and demo capture, restores
the separate RSS/watchdog identities and missing enrichment identity, and
restores the guard, challenge, font, source-date and probing defects in the
review. The rest of the original honest-agent policy remains.

To revert the original policy too, **after reverting the correction**, run:

```sh
git revert 6915bd7b6738c7d74cbb5b27d5e7bb04d88a4c9f
```

The second revert restores browser impersonation, the old bypass flags,
Firecrawl's basic-proxy acquisition and fallback, retries against refused hosts,
and removes pause reporting and preservation safeguards. Neither revert
authorises restarting forbidden acquisition. Do not push or deploy here.
