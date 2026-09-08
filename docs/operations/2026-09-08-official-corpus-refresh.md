# Official corpus refresh, 8 September 2026

## News policy

News articles are excluded from the active OPAX corpus. External headline links
remain separate from retrieval and do not create knowledge-box resources.

The production desktop cron was still using an older daily script that fetched
Guardian articles and synced `speeches,news_articles`. It added 36 news resources
on 8 September even though the repository's newer daily sync said speeches only.

Installed the current schedule script on desktop, removed the Guardian fetch,
removed `news_articles` from the sync registry (including retries), and added a
client guard against news slugs, source IDs and classifications. Archived and
removed the 36 indexed resources and all 4,396 local article rows, rebuilt the
empty news FTS index, and cleared their derived cross-reference cache. The news
catalog returned zero afterwards. Public news document endpoints return 410;
the corpus cache epoch is `2026-09-08-official-corpus`.

Recovery evidence is outside the corpus at
`desktop:~/.cache/autoresearch/corpus-refresh-20260908/`: original news rows,
news cross-reference results, full indexed resources, bill registry tables and
the removal result. `scripts/remove_news_corpus.py` is repeatable, defaults to
audit only and validates resource identity before deletion.

## Bills

Moved the existing desktop bill registry fetcher into version control under
`scripts/bills_registry/`. Its old `--refresh` re-parsed cached HTML; it now
fetches fresh listing and homepage responses. `--max-cache-age` allows an
interrupted run to reuse pages fetched recently, without returning to older
cached data. Fetch failures return failure instead of appearing successful.
Writes commit per bill, so network waits do not hold the SQLite writer lock.

The 48th-parliament listing has 281 bills, up from 276. Five were introduced on
7 September: r7535, r7536, r7537, s1512 and s1514. Registry keys and existing
reviewed summaries are preserved. This refresh publishes all 2,974 registry bills to the KB, including factual
metadata for bills without a reviewed summary. Previously, only 1,703 bill
resources were indexed. The daily job now refreshes the current parliament,
exports bill projections and upserts the corresponding KB resources.
The website's static projections are published with the portal release.

The completed publication checked all 2,974 registry files with no failures:
1,276 created, seven updated and 1,691 unchanged. Live resource counters then
reported 618,373 resources. Bill exports and their directory/detail fetches now
revalidate on each new visit, avoiding an old hourly browser cache after release.

## Other sources and limits

The daily source logs were audited against live source checks. The NSW Parliament
calendar confirms that the next sitting is 15 September; its latest stored
Hansard is 6 August. OpenAustralia's refreshed date checks still return no data
for 7–8 September; its latest stored federal Hansard is 20 August. Do not call
those unpublished upstream records ingested. QLD/VIC latest stored speeches are
26/28 August; committee coverage remains limited to the fetcher's sources.

NSW official ministerial releases were fetched through 8 September, and PM
transcript IDs 47577–47800 were checked. Their accepted recent records were
synced with official-source, date, licence and duplicate-body checks. NSW
release acquisition and sync are now part of the daily job.

SA's Hansard calendar returns HTTP 403 to the automated fetcher. Its stored
coverage still ends on 12 November 2024. The fetcher now raises an error for this
condition and the daily script reports failed steps; an inaccessible source is
not reported as successfully refreshed. The existing speech-footer repair and
separate enrichment queues continue independently; this refresh does not claim
those historical backfills have finished.

## Interface changes

The agency-map link matches the adjacent toolbar controls. All guided-journey
titles use larger serif headings on desktop and mobile. The bills directory
omits summary-availability labels, counts and the availability filter; actual
summaries remain on bill detail pages.
