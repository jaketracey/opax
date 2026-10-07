# Build 7 people lane

Source contracts are the person and party sections in `portal/public/app.js`:
`renderPersonTopics` (4894), `renderPersonSpeeches` (5384), `subjectMentions`
(4008), `subjectNews` (3980), `renderPersonDiary` (4573), `renderDonorAccess`
(4512), `partyReceiptsHTML` (4624), and `renderPartyDebts` (4687).
Worker shapes: `apiPersonTopics`, `apiTopics`, `apiSearch`, `apiBrief`, `apiNews`
in `portal/src/index.ts`. Expense wording is the unchanged
`expense-categories.json` export.

Paid sections mount collapsed and load only from a press handler. Successful
reads, including in-flight reads, share session memory in `ApiClient`.
They never use the disk cache or automatic retries. An explicit Retry button
is a new action after a failure. Static reads continue through the catalog
cache and keep their saved-copy notices.

| Route                                                | Explicit action                             | Requests on first action                | Later in same session |
| ---------------------------------------------------- | ------------------------------------------- | --------------------------------------- | --------------------- |
| `/api/person-topics?name=…`                          | Show topics                                 | 1                                       | 0                     |
| `/api/topics`                                        | Show topics, whole-record comparison        | 1                                       | 0                     |
| `/api/search?q=…&speaker=…&page=1&per=8&sort=newest` | Show speeches                               | 1                                       | 0                     |
| `/api/search?q="…"&top_k=6`                          | Show Person mentions or Party in parliament | 1 per subject                           | 0                     |
| `/api/brief?rids=…`                                  | Show speeches or Party mentions, one batch  | 0 if no valid resource IDs; otherwise 1 | 0 after success       |
| `/api/news`                                          | Show news on Person or Party                | 1 shared by both                        | 0                     |

This lane does not add person joins: inputs are the guarded profile identity,
party pages retain `partyMembers` and the party-status trap, and result speakers,
meeting attendees, diary organisations, lobbyists and creditors are plain text.
A minister diary additionally requires the guarded identity to have the diary's
jurisdiction. No new people searches, witness pages or donor pages are added.
Document rows use `fromWebPath`, then the existing web fallback.

`/expenses` maps to the native glossary sheet. Party canonical paths map to the
existing native Party route. Pay and Party receipts blocks are shared by Person
and Your MP. Party follows retain the existing 50-item cap and alternating
numbered copies; Today reads only the static money graph for their change markers.

The fixture manifest pins `/access.json` to its existing source commit, and pins
`people-fixtures.json` by SHA-256 and size. Albanese speech rows and stored machine
briefs are copied from the public bill files listed in that fixture's provenance.
Resource IDs there are explicitly fixture-only identities, not production IDs.
News headlines were read from the web's two public RSS feeds without calling
OPAX's paid news route. The person-topic fixture is an empty local catalogue; its notes are behind ⓘ. Its zeros are not a production count. Synthetic unit fixtures
exercise nonempty All, Then and Now comparisons without fabricating facts about
real parliamentarians. Labor has no access match in the pinned web export, so
journey 37 checks honest empty meetings/lobbying states. The NSW diary journey
uses Chris Minns's published rows; decoder tests cover jurisdiction refusal.

Journeys 36 and 37 run at standard size. The light process captures each new screen at AX5. The local timing probe records
party-link resolution in its press handler through the title's first native
TextKit layout. `check-people-party-timing.ts` reads that native identifier from
Maestro evidence and requires it to be below 2,000 ms. Metro replaces the probe
with a no-op in production and excludes the e2e module.

The resumed lane uses the October design system: category sections, native
disclosures, money figures and compact navigation rows. Full pay, diary,
receipt and retrieval notes live behind info buttons. Expense definitions
retain the export wording; category notes live behind info buttons. Licences,
credits and source names are held on Sources and licences, including the new
diary, lobbyist and headline sources and the expense glossary’s definition
links. Source terms with no verified version stay qualified. No web branch,
Worker change, deployment or production paid read is required.

The people fixture now includes local resource contract responses for its two
public speech samples. Their full text is explicitly a local absence notice,
not invented Hansard. They exercise the records lane’s native reader, reached
through `fromWebPath`; that reader still owns document fetching and caching.
