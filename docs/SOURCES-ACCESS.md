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

## Permission review, 19 October 2026

Relevant replies received since the 10 October decision were read in full. Private
correspondence and message links remain in the maintenance archive outside this
public repository. Reuse permission, a working identifying request and an
implemented public projection are separate requirements.

- Victorian Parliament approved Hansard and Register of Members' Interests reuse
  on 13 October, subject to fair, accurate, non-misleading presentation and free
  public access. On 19 October the identifying client could read the interests
  listing and sampled current PDFs. The interests adapter and its election-build
  coverage review remain unimplemented; see [DATA-INTERESTS.md](DATA-INTERESTS.md).
  Portrait permission extends only to material whose copyright Parliament owns.
- ACT Elections approved gift-return use from FY2012–13 onwards on 13 October:
  preserve figures and disclosure dates, attribute the ACT Electoral Commission,
  link the originals and keep jurisdictions separate. Organisations may be named;
  individual donors are counted only. The agreed correction window is two business
  days, with removal on request. Existing donor-type guesses do not establish an
  organisation's identity, so the research export remains held pending a suitable
  public projection. The 19 October official-index probe stopped when the redirect
  destination's robots policy was unavailable in the client; latest source coverage
  was not established. This is a client integration gap, not evidence of HTTP 403,
  a robots denial, a source outage or a new permission refusal.
- APH's 15 October response referred the request internally; SA Hansard's
  12 October response was still investigating access. Neither granted access.
  No new Queensland Parliament or GrantConnect/Finance approval was found in the
  bounded mailbox searches. Their existing pauses remain in force.
- ECSA refused republication of its disclosure returns on 15 October. That
  refusal is separate from the pending SA parliamentary Hansard request. WAEC's
  response acknowledged consideration, without granting publication permission.

The approved identity and no-workaround policy above continue to apply. These
email findings do not clear an inaccessible route, enable a research-only export
or authorise the publication of held source bodies.

## Pause review, 10 November 2026

Each paused host was asked once with the identifying agent, from the refresh
instance and from a home connection, following no redirect and touching no
pipeline state. The parliamentary hosts and GrantConnect refuse the agent from
both: `parlinfo.aph.gov.au`, `www.aph.gov.au`, `data.parliament.qld.gov.au`,
`hansardsearch.parliament.sa.gov.au` and `www.grants.gov.au/Ga/List` answered
HTTP 403 to the page and to `/robots.txt` alike, so the refusal is of the agent,
not of a datacentre address. Those pauses stand; permission remains requested.

Two pauses were the client's, not the publisher's:

- `diaries_qld`: `cabinet.qld.gov.au` serves the real ministers page (HTTP 200,
  37 KB) with Imperva's `/_Incapsula_Resource` detection script near the end, and
  the challenge detector treated any such script as a challenge page. Cloudflare's
  `/cdn-cgi/challenge-platform/` script is injected into content pages the same
  way. The detector now recognises the challenge itself (an iframe or form, or a
  title that says so), never its detection script (`parli/ingest/http.py`,
  `tests/test_challenge_detection.py`). The source resumes with the next monthly
  group; it had been paused since 19 October on this false positive.
- `qld_contracts`: `www.data.qld.gov.au/api/3/action/package_search` answers
  HTTP 200 to the agent, but the portal's `robots.txt` disallows `/api/` for every
  agent (RFC 9309 reading; Python 3.12's parser drops the rule because of the
  blank lines after `User-agent: *`, which is why the earlier probe read it as
  allowed), and the dataset downloads the fetcher then follows redirect to a host
  the shared transport cannot check. The pause stands until either the CKAN
  listing is read from a path robots allows or Queensland's open data team
  confirms the API is open to identifying clients.

The knowledge box's schema stopped offering a no-generation summary provider on
about 4 November, which made the releases publication gate refuse every night
after. The newest resources carry no processing summary, so the gate now proves
behaviour as well as configuration (`scripts/publish_collected_bill_texts.py`).

## Manual GrantConnect acquisition, 11 November 2026

Jake Tracey downloaded three GrantConnect Grant Award List exports by hand in a
browser on 11 November 2026, filtered by Publish Date. This was a manual
acquisition, not a fetcher: the automated route (`grants_fetch`) is still paused,
and `www.grants.gov.au` still answers the identifying agent with HTTP 403.

| Publish dates | Source URL | Awards | SHA-256 |
| --- | --- | --- | --- |
| 1 to 30 Sep 2026 | `https://www.grants.gov.au/Ga/DownloadResult?Type=Ga&AgencyStatus=-1&KeywordTypeSearch=AllWord&DateType=Publish%20Date&DateStart=01-Sep-2026&DateEnd=30-Sep-2026` | 3,072 | `aa37197e3e9557c48bfd1bc448ce9711e6995c2316cf50e3950747e076663f3d` |
| 1 to 31 Oct 2026 | `https://www.grants.gov.au/Ga/DownloadResult?Type=Ga&AgencyStatus=-1&KeywordTypeSearch=AllWord&DateType=Publish%20Date&DateStart=01-Oct-2026&DateEnd=31-Oct-2026` | 6,397 | `0e0bef48674d8efc48ecfb638fffc1fa4ce6d24c00c8f6d1a8f2fdb05b0124a8` |
| 1 to 11 Nov 2026 | `https://www.grants.gov.au/Ga/DownloadResult?Type=Ga&AgencyStatus=-1&KeywordTypeSearch=AllWord&DateType=Publish%20Date&DateStart=01-Nov-2026&DateEnd=11-Nov-2026` | 375 | `69461011a54e6719ba640bfcd6cef78c9edba2bb068cc5ce5bb74a2dd3f19cae` |

The workbooks were read from the local cache with every outbound request routed to
a closed port, so nothing reached grants.gov.au (9,844 distinct awards, $2.49B,
loaded in 0 seconds into a stage file). `ext_apply grants` then applied the stage
from 10 October: 2,260 new awards, nothing deleted. For 1 September to 9 October
the exports matched the stored awards id for id, except that 24 awards carry an
amended value and six Attorney-General's Department awards published on 6 and 7
October (recipient "n/a", $4,600 to $6,900) are absent from the export. Neither
change was applied, so the stored rows for that window did not shrink; both are
held for review.

No award detail pages were fetched. Awards from this load have no ABN-derived
location or electorate and no link to their GrantConnect page, so they appear on
recipient and program pages but not in the largest-awards list, which lists only
awards linked to their record.

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
