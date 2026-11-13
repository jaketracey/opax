# Local follows and saved-seat contracts

Import directly from the named modules. All computation stays on the device;
seat and follow choices are never request parameters, account data or
notification permissions. The shared FollowButton lives in design/controls,
and the Following screens compose the store and row contracts below.

## Store: `store.ts`

```ts
type FollowKind = 'person' | 'bill' | 'electorate' | 'party';
interface Reading {
  value: string | number | null;
  words?: string;
  asAt: string | null;
  records?: FollowRecord[];
}
type Fingerprint = Record<string, Reading>;
interface Follow {
  kind: FollowKind;
  id: string;
  title: string;
  followedAt: number;
  seen: Fingerprint | null;
  seenAt: number | null;
  seenKeys?: string[];
}
interface OpaqueFollow {
  kind: string;
  id: string;
  [field: string]: unknown;
}
type SavedFollow = Follow | OpaqueFollow;
type FollowResult = 'followed' | 'already' | 'limit';
const FOLLOW_LIMIT: 50;
function followKey(f: { kind: string; id: string }): string;
function decodeFollows(raw: unknown): SavedFollow[];
function isKnownFollow(f: SavedFollow): f is Follow;
function loadFollows(): Promise<Follow[]>;
function useFollows(): Follow[] | null;
function follow(
  item: Pick<Follow, 'kind' | 'id' | 'title'>,
): Promise<FollowResult>;
function unfollow(key: string): Promise<void>;
function clearFollows(): Promise<void>;
function markSeen(
  key: string,
  current: Fingerprint,
  keys?: readonly string[],
): Promise<void>;
function markAllSeen(): Promise<void>;
function resetFollowsForTests(): void;
```

Follows use `opax-follows-v1.json` and `opax-follows-v1.b.json`, alternately
numbered complete copies. Saves finish before subscribers redraw. A torn write
leaves the previous complete copy. Unknown kinds retain every field and are
excluded from `loadFollows()` and `useFollows()` because this build cannot render
them. `decodeFollows()` exposes them for storage inspection. Unfollow and clear
operate on supported kinds; future entries remain intact.

The future-topic slots are `opax-follows-topics-v1.json` and
`opax-follows-topics-v1.b.json`. This build does not create topic follows. It
reads both files for the shared 50-follow limit, including opaque kinds, and
leaves untouched topic bytes alone. The frozen 1.0 decoder and save path in
`tests/fixtures/follows-1.0/` prove downgrade preservation.

`markSeen` merges readable status markers and the exact keys shown, newest
first, retaining earlier keys up to 50 per follow. Already-seen keys still in
the current readings take priority over retired history, so repeated partial
acknowledgements cannot evict a still-current bill or vote. Supplying a record
marker reading does not mark every record in it: only the supplied keys become
seen. Missing keys do not mean
removed records. An identity that leaves a latest list and returns stays seen
while retained in that window. A missing `seenKeys` baselines the first ready
check silently, including legacy and downgraded files. A ready marker absent
from `seen` also baselines silently: the loader saves only that reading and its
keys, preserving existing unseen changes when a catalog recovers. Omitted `keys` preserves
the stored keys. A card passes only the records it showed, plus the party and
seat markers, rather than the profile's whole reading. `seenAt` is only the
last-look date for the group heading. `markAllSeen` checks the existing shared
follow catalogs and skips unavailable follows and unreadable markers.

### Product decision pending: Mark all as seen and saved changes (11 November 2026)

Following can display a previously saved change even when its source cannot
currently be read. `useFollowStates.ts` restores the saved ready state, or
merges saved markers into a partial current state, and labels those changes
as stale. The menu in `Following.tsx` calls `store.ts:markAllSeen`, which
recomputes states from `catalogs.followSources` alone. It does not use those
restored states. An unavailable follow or omitted marker can therefore keep
its visible saved change after Mark all as seen. A readable stale catalogue
is still acknowledged; this is specifically about restored changes absent
from the available catalogues.

The product choice is whether “all” means every change currently displayed,
including saved changes, or only changes supported by the available sources.
The former needs the displayed fingerprints and keys passed to the store;
the latter needs copy that explains what remains unchecked. Decide this
before changing the acknowledgement contract. Implementation belongs in
`Following.tsx`, `useFollowStates.ts` and `store.ts`, with regressions for
fully unavailable and partially unavailable sources. Behaviour is unchanged
by the d3 search/explore bug pass.

## Changes: `changes.ts` and `markers.ts`

```ts
type QuestionType = 'bill-stage' | 'amendment' | 'procedural' | 'unknown';
interface FollowRecord {
  key: string;
  kind:
    | 'vote'
    | 'register'
    | 'bill'
    | 'division'
    | 'speech'
    | 'stage'
    | 'return'
    | 'member';
  date: string;
  added?: string;
  title: string;
  action?: string;
  detail?: string;
  billKey?: string;
  divisionKey?: string;
  slug?: string;
  url?: string;
  question_type?: QuestionType;
  position?: 'for' | 'against';
  stage?: string;
  chamber?: string;
  outcome?: string;
  category?: string;
  operation?: 'addition' | 'deletion';
  name?: string;
}
interface Change {
  marker: string;
  text: string; // action only; never a record title
  citation: string;
  asAt: string | null;
  key?: string;
  coveredKeys?: string[];
  record?: FollowRecord;
  dateNotPublished?: boolean;
  today?: false;
  reading?: Reading;
  stale?: boolean;
  savedAt?: number | null;
}
type FollowSources = Awaited<ReturnType<Catalogs['followSources']>>;
type FollowState =
  | {
      status: 'ready';
      title: string;
      current: Fingerprint;
      keys: string[];
      changes: Change[];
      stale?: boolean;
      savedAt?: number | null;
    }
  | { status: 'missing' }
  | { status: 'unavailable' };
function followState(
  follow: Pick<Follow, 'kind' | 'id' | 'seen'> &
    Pick<Partial<Follow>, 'seenKeys'>,
  sources: FollowSources | null,
): FollowState;
function needsFor(follows: readonly Pick<Follow, 'kind'>[]): {
  parties: boolean;
  people: boolean;
  bills: boolean;
  electorates: boolean;
};
const kindLabels: Record<FollowKind, string>;
function quarterEnd(quarter: string): string;
function changesFor(
  follow: Pick<Follow, 'kind' | 'seen' | 'seenKeys'>,
  current: Fingerprint,
): Change[];
function currentKeys(current: Fingerprint): string[];
function seenKeysForChanges(changes: readonly Change[]): string[];
function questionType(vote: {
  name?: string;
  title?: string;
  stage?: string;
  question_type?: QuestionType;
}): QuestionType;
function voteAction(
  type: QuestionType,
  position: 'for' | 'against',
): string | null;
function declarationAction(
  category: string,
  operation?: 'addition' | 'deletion',
): string;
function changeDate(
  date: string | number,
  year?: number,
  alwaysYear?: boolean,
): string;
function changeText(change: Change, year?: number): string;
function changeAccessibilityLabel(change: Change): string;
function moreChangesText(n: number): string;
function sortChanges(changes: readonly Change[]): Change[];
function todayChanges(changes: readonly Change[]): Change[];
```

`Change` is also re-exported from `markers.ts`. Lists compare identities,
statuses compare values, and there is no date cut-off. Every displayed line
uses the record's own date. Statuses without a published date have
`dateNotPublished` and the spoken suffix "date not published". Spoken follow
change dates use a long month and include the year only outside the current
year, matching the visible line. The spoken remainder is its own sentence,
"And 3 more.", while the visible remainder stays "and 3 more". Today orders
newest first, statuses first on equal dates, then text, and uses `todayChanges`
to exclude expenses. There is no pay change. `moreChangesText` has no noun.
A stage and division with the same stage, chamber and date yield one division
row and one change line. Party totals changing never create a change.
A bill's status change is a sentence, the same on screen and to VoiceOver:
"Now passed; was before parliament", "Received Royal Assent; was passed".
While a change is unseen its row (Today and Following alike) shows the
change line in ink led by the new dot, and drops the status pill and date
that would repeat it; the pill returns above the title once seen. Followed
bill titles are serif (`rowRecord`), three lines to XXXL and six from AX1.

Identity lists stay within the 50-key budget: the newest 10 introduced bills,
20 register entries, the existing vote list (at most 12), one record for each
DATA-11 latest field, and only the newest financial year for returns. Older
years and revised totals do not create return changes. Party membership uses
`partyMembers(...).current`, matching the party page, and compares complete
person-ID sets in `members.value` with names in `members.records`. It emits a
named line for each added or removed member. Member keys never enter
`currentKeys` or `seenKeys`; marking seen stores the complete new set.
`seenKeysForChanges` returns the exact non-membership identities for visible
rows, including `coveredKeys` for a stage represented by its division. Use it
for Today, `/follows` and page acknowledgements; the page group already does
this. This keeps the stage seen after the latest division moves to another
event. `currentKeys` also includes that stage for Mark all as seen.

| Marker                    | Available data and fallback                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Person party / seat       | Existing profile identity and its own date                                                                                                             |
| Person votes              | Existing `for` / `against` lists, explicit question type when available, otherwise the stored name and stage; procedural and unknown questions omitted |
| Person declarations       | Optional `latest` / `items` on the existing interest-index entry; the current total alone supplies no identity or entry wording, so it stays quiet     |
| Person bills introduced   | Bills already present in `FollowSources`, joined by a published sponsor identifier or exact name; no extra bill read for person follows                |
| Expenses                  | A new quarter only, page group only, no amount                                                                                                         |
| Bill status / stage       | Existing status and date; "Moved to a new stage" until `latest_stage` arrives                                                                          |
| Bill divisions / speeches | Optional `latest_division` / `latest_speech`, with their own keys and dates; current counts alone stay quiet                                           |
| Party returns             | Distinct financial years in the existing money graph, with the graph's publication date; no total or amount                                            |
| Party members             | Named canonical people from roster and release catalogs when these are already present; no extra roster read for a party-only list                     |
| Electorate                | Existing representatives, status and latest election date                                                                                              |

Optional richer fields are detected in memory. `followSources`, API decoders
and the request allow-list are unchanged here. Data lanes must preserve the
new fields in their decoders when publishing DATA-2 and DATA-11. A failed or
partial catalog never means an identity disappeared or a value changed.

## Loader and saved Today result

```ts
// useFollowStates.ts
function useFollowStates(refresh?: number): {
  follows: Follow[] | null;
  states: Map<string, FollowState>;
  sources: FollowSources | null;
  savedResult: StoredFollowResult | null;
  resultLoading: boolean;
  changeSetKey: string;
};
function markSeenNow(follow: Follow): Promise<void>;
// markAllSeen is re-exported here too.

// store.ts
interface StoredFollowResult {
  version: 1;
  shape: 'collapsed' | 'expanded';
  checkedAt: number;
  states: [string, FollowState][];
  sourceDates: Record<string, string | null>;
}
function loadFollowResult(): Promise<StoredFollowResult | null>;
function saveFollowResult(result: StoredFollowResult): Promise<void>;
function followResultKey(result: Pick<StoredFollowResult, 'states'>): string;
```

The loader reads on open, foreground, changed needs and refresh. A saved ready
reading survives a failed refresh with `stale`; its changes can be marked seen
once visible. `markSeenNow` is baseline-only, to keep `FollowButton`'s
mount effect from clearing a subsequent change.

The Today result uses `opax-follows-today-v1.json` and its `.b.json` slot. Wait
for `resultLoading` before deciding the initial layout. With no result, draw
the collapsed row. Restore `savedResult.shape`; crossfade once when
`changeSetKey` changes. Check time and array order do not change that key.
Today owns the animation and own-MP exclusion; it may save the final shape
through `saveFollowResult` after applying its own placement rules.

## Parts

All component functions below return `React.JSX.Element` (or `null` for the
group), and their named props interfaces are exported beside them.

```ts
// ChangeLine.tsx
interface ChangeLineProps {
  change: Change;
  /** Unseen: led by NewDot, set in ink. */
  fresh?: boolean;
  testID?: string;
}
function ChangeLine(props: ChangeLineProps): React.JSX.Element;

// AddedSinceGroup.tsx
interface AddedSinceGroupProps {
  follow: Follow;
  changes: readonly Change[];
  testID: string;
  onRowPress?: (change: Change) => void;
  current?: Fingerprint;
  stale?: boolean;
  savedAt?: number | null;
  unavailable?: boolean;
}
function AddedSinceGroup(props: AddedSinceGroupProps): React.JSX.Element | null;

// useSeenOnView.ts
interface SeenView {
  measureInWindow(
    callback: (x: number, y: number, width: number, height: number) => void,
  ): void;
}
function useSeenOnView(
  ref: React.RefObject<SeenView | null>,
  keys: readonly string[],
  onSeen: (keys: readonly string[]) => void,
): void;

// NewDot.tsx
function NewDot(props: { testID?: string }): React.JSX.Element;

// FollowRow.tsx
interface FollowRowProps {
  follow: Follow;
  state?: FollowState;
  testID?: string;
  ownMP?: boolean;
  onUnfollow?: () => void;
  portraitURI?: string;
  surface?: 'today' | 'following';
}
function FollowRow(props: FollowRowProps): React.JSX.Element;
function followRoute(
  follow: Pick<Follow, 'kind' | 'id'> & { changes?: readonly Change[] },
  state?: FollowState,
): {
  pathname:
    | '/party/[slug]'
    | '/person/[slug]'
    | '/bill/[key]'
    | '/electorate/[id]';
  params: object;
};

// PartyRow.tsx
interface PartyRowProps {
  party: string;
  testID?: string;
  detail?: string;
  onPress?: () => void;
}
function PartyRow(props: PartyRowProps): React.JSX.Element;
```

Pass ready-state `changes` directly to the group; each carries its reading and
saved metadata. `current`, `stale` and `savedAt` optionally override these.
With no changes, or `unavailable`, nothing draws. The group's initial reading
stays for the visit after marking. Named members use `PersonRow`; other named records use `LatestRow`. Status lines use
body text, and stage or return links call the page's scroll handler. `onRowPress` opens a disclosure and scrolls a same-page record.
Otherwise a record follows its own route. Place the group after the header
source line on bills, profiles and parties, and after the electorate title
block. Screen lanes own arrival scrolling and the visit's dotted sections.

`useSeenOnView` measures the group's top edge below the native header and
above the safe-area bottom. It marks after one continuous second in view, or
on blur, background or unmount after any visibility. It never marks on a tap,
on mount or after an entirely off-screen render. Use a non-collapsable native
View ref. Pass the exact displayed keys; the callback decides the readable
status markers to accompany them.

`NewDot` is 8 pt times the text scale, tint, label "New". Page sections should
hide the decorative dot from separate focus and append "new" to the row's
label. `FollowRow` has no dot, inherits `rowMenus.following` and its matching
accessibility actions, and never marks on tap. Pass `surface="today"` in
Today's block. `followRoute` adds `section: 'changes'` when supplied changes
or a ready changed state. It copies the existing route mapping and does not
import Today's screen. `PartyRow` inherits `rowMenus.place` and its actions.
`LinkRow` supports rich titles, a title role, a secondary slot and a separate
leading accessory, so party identity and change text keep the shared anatomy.

## Latest rows: `../your-mp/LatestRows.tsx`

```ts
interface LatestRecord extends FollowRecord {
  action: string;
  detail: string;
  href?: Href;
}
interface LatestRowsProps {
  records: readonly LatestRecord[];
  limit?: number;
  compact?: boolean;
  testID?: string;
  onRowPress?: (record: LatestRecord) => void;
}
function latestRecord(record: FollowRecord): LatestRecord | null;
function latestRecords(
  profile: Pick<ProfileView, 'blocks' | 'slug' | 'personId'>,
  bills?: BillIndex,
  limit?: number,
): LatestRecord[];
function LatestRow(props: {
  record: LatestRecord;
  testID?: string;
  onPress?: () => void;
}): React.JSX.Element;
function LatestRows(props: LatestRowsProps): React.JSX.Element;
```

Place inside `InsetGroup` for separators. Default limit 5; Today passes 3.
Composition uses only loaded profile blocks and an optional loaded bill index,
excluding speeches, statement entries and entries without their own date.
Ties use vote, register, bill, then title. The register title is `recordText`,
three lines; other titles are unlimited `rowRecord`. Vote questions follow
`questionType`; matched votes open the exact division or fall back to the
bill's divisions section. Unmatched votes open an original in the in-app
browser and carry "View source", Share and Copy link actions. Dates in record
rows always include the year, including their accessibility labels. Both row
glyphs stop at 1.5 times the text scale; row gaps use `rhythm.tight` and
`rhythm.line`. The composition lives in this owned module;
the screen and Today use these same exports.

## Saved-seat hooks and welcome replay

```ts
// ../your-mp/choice-store.ts; saved choices retain the 1.0 shape.
function loadChoice(): Promise<SeatChoice | null>;
function saveChoice(choice: SeatChoice): Promise<void>;
function forgetChoice(): Promise<void>;
function subscribeChoice(
  listener: (choice: SeatChoice | null) => void,
): () => void;

// ../your-mp/useSeat.ts
type SeatState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'chosen'; choice: SeatChoice }
  | { status: 'error'; message: string };
interface SeatActions {
  forget(): Promise<void>;
  retry(): void;
  choose(seat: Electorate): Promise<void>;
  chooseState(seat: Electorate, region?: Electorate): Promise<void>;
  removeState(): Promise<void>;
}
function useSeat(): SeatState & SeatActions;
function migrateSeatChoice(
  choice: SeatChoice,
  seats: readonly Electorate[],
): SeatChoice | null;
function savedSeatDirectory(): Directory | null;
function migratedSeat(): Electorate | null;
function resetSeatForTests(): void;

// ../your-mp/useIsMyMember.ts
function useIsMyMember(slug: string): boolean;

// ../your-mp/useSetAsMyElectorate.ts
interface SetAsMyElectorate {
  visible: boolean;
  label: string;
  run(): Promise<void>;
}
function useSetAsMyElectorate(seat: Electorate): SetAsMyElectorate;

// ../welcome/replay.ts
function replayWelcome(): void;
```

The seat remains `SeatChoice` from `../your-mp/model.ts`: version 1, `seatId`
and `stateSeatIds`. `opax-seat-v1.json` and its second slot retain saved choices. Forget writes a version-1 `forgotten: true` tombstone through the same two-slot protocol, so a current reader cannot revive the older slot.
Migration is read-only until a choice: federal House seats remain chosen,
abolished federal seats stay available for the abolished state, Senate and
other-state choices give the invitation, and Victorian choices move into
`stateSeatIds` with an empty federal `seatId` in memory. `migratedSeat()` retains
the original seat for invitation copy and the initial state browse list.
Choosing outside Victoria clears state IDs in the same write; choosing within
Victoria keeps the migrated state choice. State and region can save together.
A successful choice emits once and gives a success haptic. All hook users
share one directory read; a choice emits without refetching it.

`useIsMyMember` checks the current, verified federal House representative and
resolves their slug locally. It is false for a vacant or historical seat.
`useSetAsMyElectorate` hides the item for this seat, senators, state seats,
historical seats and while loading. Its label is "Set {Seat} as my electorate".
No seat saves immediately; another seat asks "Replace {Old} with {New}?" with
Replace and Cancel. Failure shows the device-specific save Alert with Try
again and Cancel and leaves every consumer unchanged. For `rowMenus.place`
and `rowMenus.person`, supply `setSeat` only when visible, with
`{ label, onSelect: () => void run() }`.

`replayWelcome()` presents the registered welcome route through `welcomeRoute()`.
It records no location or account choice.

## Shared control and fixture seed

Import `FollowButton` from `design/controls` or `design/primitives`. The control directly calls the follow store and baselines a new follow through `markSeenNow`; it preserves the secondary capsule, state suffix test IDs, local save errors and the Edit Following limit action. There is no separate follow-toggle adapter.

The e2e-only `OPAXSeedFollows 50` launch argument uses fifty real identities
from the pinned roster only when there is no saved list. Metro replaces its
launch-fixture module with the production stub in release builds.
