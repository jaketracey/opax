# Local follows

Follow a parliamentarian, bill or electorate on this iPhone; Today's
Following block shows what changed in the published record since the reader
last looked (`docs/IOS-UX.md`, "Follows and alerts", local follows P1, phase 1).
Nothing is synced: no server, account or device token, and no notification.

- `store.ts`: the follows file, `opax-follows-v1.json` in the app's documents
  beside the saved seat (`opax-seat-v1.json`), written through a temporary
  file. At most 50 (`FOLLOW_LIMIT`). Each follow keeps the canonical ID, the
  name when followed, when it was followed, and the markers it last showed
  (`seen`, `seenAt`). Device backups may include it.
- `markers.ts`: pure. Reads each follow's markers from the shared catalogs and
  words what changed. Nothing is read per followed record, so many follows never
  crowd the bounded catalog cache (40 entries).
- `useFollowStates.ts`: loads `catalogs.followSources(needs, refresh)` when Today
  opens, when the app returns to the foreground, when a new kind is followed and
  on a pull to refresh (which revalidates every file). A follow's first reading
  becomes what was seen.
- `FollowToggle.tsx`: the switch on profiles, bills and electorates
  ("Follow Grayndler, switch button, on"). Following, or opening the page of
  something followed, marks it seen with the record as published now.
- `FollowingSection.tsx`: Today's block. Opening a row marks it seen.
- `ManageFollows.tsx` (`/follows`, pushed in the current tab from Today or Your
  MP's `FollowingEntry`): list, unfollow, unfollow all.

## Markers

A marker is compared by value only; its date and words are shown, never
compared. When a catalog fails, its markers are skipped and keep their last
seen value, so a failure never reads as a change.

| Follow          | Marker            | Source field                                                                                                                   | As-at date shown                                                                                     | Words (examples)                                                                                                                                                                                                                                                   |
| --------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Parliamentarian | `declarations`    | `/interests/index.json` `people[<register key>].total`, the register key resolved by `profileFor`                              | `_meta.generated`                                                                                    | "1 new declared entry", "2 fewer declared entries", "Register file now held, with 28 declared entries" · cited as the seat's register ("Register of Members’ Interests", "Register of Senators’ Interests", the Queensland register, else "Register of interests") |
| Parliamentarian | `divisions`       | `/votes.json` `divisions_total`, summed over the member's records (`profileFor` votes `total`)                                 | `_meta.latest_division_date`; "date not published" when the file has no `_meta` (the pinned fixture) | "12 new recorded divisions" · They Vote For You, or OPAX's state Hansard sample                                                                                                                                                                                    |
| Parliamentarian | `party`           | release `people.json` seat observations with the roster's `party_now`/`current` (`profileFor` identity `party`, `partyStatus`) | the current seat's `as_of`, else the roster's `meta.generated`                                       | "Party now recorded as Independent; was Labor" · OPAX parliamentary roster                                                                                                                                                                                         |
| Parliamentarian | `seat`            | release `people.json` `electorates[]` where `current` (IDs compared, names shown)                                              | that seat's `as_of`                                                                                  | "Seat now recorded as Sydney; was Grayndler", "No current seat recorded; was Grayndler" · OPAX electorate release                                                                                                                                                  |
| Parliamentarian | `pay`             | `/pay.json` `meta.as_of` with the member's `now.post` and `now.salary`                                                         | `meta.as_of`                                                                                         | "Pay now recorded as $622,102 a year as Prime Minister", or "Pay records updated" when only the date moved · Remuneration Tribunal; Parliamentary Handbook                                                                                                         |
| Parliamentarian | `expenses`        | `/expenses.json` `meta.to` (last IPEA quarter) with the member's rounded `total`                                               | `meta.generated`                                                                                     | "Expenses now cover to June 2026: $24,402,773 recorded", "Recorded expenses revised to …" · Independent Parliamentary Expenses Authority                                                                                                                           |
| Bill            | `status`          | `/bills/index.json` row `status`                                                                                               | row `status_as_of`                                                                                   | "Now passed; was before parliament" · ParlInfo bill records                                                                                                                                                                                                        |
| Bill            | `moved`           | row `status_as_of` (only when the status itself is unchanged)                                                                  | row `status_as_of`                                                                                   | "New stage recorded on 26 August 2026"                                                                                                                                                                                                                             |
| Bill            | `divisions`       | row `divisions`                                                                                                                | index `generated_at`                                                                                 | "2 new divisions"                                                                                                                                                                                                                                                  |
| Bill            | `speeches`        | row `speeches`                                                                                                                 | index `generated_at`                                                                                 | "1 new speech"                                                                                                                                                                                                                                                     |
| Electorate      | `representatives` | release `index.json` row `representatives[].person_id` when `representation_status` is `verified` (names shown)                | row `representation_as_of`                                                                           | "Representative now recorded as X; was Y", "X now recorded; Y no longer recorded" · OPAX electorate release                                                                                                                                                        |
| Electorate      | `status`          | row `status` (`current`, `historical`)                                                                                         | row `representation_as_of`                                                                           | "Now recorded as abolished"                                                                                                                                                                                                                                        |
| Electorate      | `election`        | row `latest_election` and `election_count` (optional index fields, decoded for follows)                                        | `latest_election`                                                                                    | "New election result: 3 May 2025"                                                                                                                                                                                                                                  |

The bill index has no stage name; the detail file's `key_dates` would name it,
but reading one file per followed bill would crowd the cache, so a moved bill
says when it moved and points to its page. The as-at dates of pay and
expenses move with each export, so "Pay records updated" can appear without a
new rate; it says only that.

## Notifications (proposal, not built)

Background refresh and local notifications need a notification permission and
a stated purpose in the production app, so they are a later decision. Proposed:

- **Off by default.** A "Notify me about changes" switch in Manage follows asks
  for permission only when turned on. Local notifications only: no push, no
  device token, nothing about follows leaves the iPhone.
- **Background refresh.** One `BGAppRefreshTask` (Expo's background task
  module, behind a reviewed config plugin and native-boundary entry). iOS picks
  the time, often hours apart and never for an app the reader has stopped
  opening, so the app never promises timing. A run reads the follows file,
  calls `followSources(needs, true)` through the same client and allow-list
  (mostly 304s), computes changes and finishes well inside iOS's 30 seconds.
- **Notify once per change.** A separate `notified` fingerprint per follow, so a
  change notifies once even if the reader has not opened it; `seen` still
  drives Today. At most one notification per run, grouped: "2 things you
  follow changed: Anthony Albanese, 1 new declared entry; …". Tapping opens
  Today. The text is the same plain words and sources Today shows.
- **Cost first.** A changed run can download several large files (the bill index
  is 1.7 MB, votes 1.3 MB). W16 in `docs/IOS-APP.md`, a small per-refresh list
  of changed entity keys, would let a background run fetch one small file and
  read the large catalogs only when a followed key appears in it. Build W16
  before notifications.
- **Tests.** Unit tests for the `notified` logic; on the simulator, LLDB's
  `_simulateLaunchForTaskWithIdentifier:` triggers the task against the fixture's
  changed-data mode, and the connection audit covers the run.
