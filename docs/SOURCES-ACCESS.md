# Source access

Jake's approved decision, 10 October 2026: all OPAX source requests identify
themselves with the single identity in `parli/ingest/user-agent.txt`. No browser
identity, access-control workaround or proxy fallback is permitted. Python,
async downloads, shell transports and Node build scripts share that file.
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

## Rollback

From a clean checkout containing this commit, these exact commands select the
access-policy commit and make its inverse as a new local commit:

```sh
git switch ops/honest-agent
opax_access_sha=$(git log -1 --format=%H --grep='^Use the honest OPAX agent for all source fetches$')
test -n "$opax_access_sha"
git show --stat "$opax_access_sha"
git revert "$opax_access_sha"
```

Equivalently, use `git revert <sha>` with the SHA in the delivery report. Do
not push or deploy from this worktree. A revert restores browser impersonation,
the old opt-in bypass flags, Firecrawl's basic-proxy acquisition and fallback,
and retries against the refused hosts. It also removes pause reporting and the
new refusal-preservation guards, including the legacy register safeguards.
Those behaviours conflict with the standing decision; rollback is a code
recovery mechanism, not permission to restart those acquisition paths.
