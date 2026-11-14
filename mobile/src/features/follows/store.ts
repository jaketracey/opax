import { useEffect, useSyncExternalStore } from 'react';
import { track } from '../../analytics';
import { billKey, electorateId, personId } from '../../api/ids';
import { partySlug } from '../../design/party';
import { readCopies, TwoSlotStore, writeCopy } from '../../storage/two-slot';
import { currentKeys, type FollowRecord } from './changes';
import { seededFollows } from './launch-fixture';
import type { FollowState } from './markers';

/**
 * Local follows: what this iPhone follows and the change markers it last
 * showed for each. Saved in the app's documents beside the saved seat; never
 * sent anywhere. Device backups may include the file. Analytics counts a
 * saved follow or unfollow and its kind only (`opax_follow`), never which.
 */
export type FollowKind = 'person' | 'bill' | 'electorate' | 'party';
/** One marker as last seen: a comparable value, its words and its date. */
export interface Reading {
  value: string | number | null;
  /** Words for "was …" lines, such as names or a party. */
  words?: string;
  asAt: string | null;
  records?: FollowRecord[];
  /** A bill's ending, when the export names one (`ended`, `ended_label`). */
  ended?: string;
  ended_label?: string;
}
export type Fingerprint = Record<string, Reading>;
export interface Follow {
  kind: FollowKind;
  /** Canonical person ID, bill key or electorate ID. */
  id: string;
  /** The name when followed, shown until the record supplies a current one. */
  title: string;
  followedAt: number;
  /** Markers when last looked at; null until first computed. */
  seen: Fingerprint | null;
  seenAt: number | null;
  /** Most recently shown record identities, across markers. */
  seenKeys?: string[];
}
/** Future kinds are retained verbatim, and never interpreted by this build. */
export interface OpaqueFollow {
  kind: string;
  id: string;
  [field: string]: unknown;
}
export type SavedFollow = Follow | OpaqueFollow;
export const FOLLOW_LIMIT = 50;
export const followKey = (f: { kind: string; id: string }) =>
  `${f.kind}:${f.id}`;
const ids: Record<FollowKind, (v: unknown) => string> = {
  person: personId,
  bill: billKey,
  electorate: electorateId,
  party: (v) => {
    if (
      typeof v !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) ||
      v.length > 200 ||
      partySlug(v) !== v
    )
      throw new Error('Invalid party identifier');
    return v;
  },
};

// Two slots, written alternately. Each save writes a complete, numbered copy
// into the older slot, so the newest good copy is never deleted or
// overwritten: File.write is not atomic, and File.move with overwrite deletes
// its destination before moving. A read takes the newest copy that decodes,
// so a save cut short (a torn or missing slot) leaves the previous list.
const SLOTS = ['opax-follows-v1.json', 'opax-follows-v1.b.json'] as const;
const TOPIC_SLOTS = [
  'opax-follows-topics-v1.json',
  'opax-follows-topics-v1.b.json',
] as const;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const time = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
function decodeReading(v: unknown): Reading | null {
  if (!isRecord(v)) return null;
  const value =
    v.value === null ||
    typeof v.value === 'string' ||
    (typeof v.value === 'number' && Number.isFinite(v.value))
      ? v.value
      : undefined;
  if (value === undefined) return null;
  return {
    value,
    ...(typeof v.words === 'string' ? { words: v.words } : {}),
    asAt: typeof v.asAt === 'string' ? v.asAt : null,
    ...(typeof v.ended === 'string' ? { ended: v.ended } : {}),
    ...(typeof v.ended_label === 'string'
      ? { ended_label: v.ended_label }
      : {}),
    ...(Array.isArray(v.records)
      ? {
          records: v.records.filter(
            (r): r is FollowRecord =>
              isRecord(r) &&
              typeof r.key === 'string' &&
              typeof r.title === 'string' &&
              typeof r.kind === 'string' &&
              typeof r.date === 'string',
          ),
        }
      : {}),
  };
}
export function isKnownFollow(v: SavedFollow): v is Follow {
  return Object.hasOwn(ids, v.kind);
}
function decodeFollow(v: unknown): SavedFollow | null {
  if (!isRecord(v)) return null;
  const kind = v.kind as FollowKind;
  if (!Object.hasOwn(ids, kind))
    return typeof v.kind === 'string' &&
      v.kind &&
      typeof v.id === 'string' &&
      v.id
      ? (v as OpaqueFollow)
      : null;
  let id: string;
  try {
    id = ids[kind](v.id);
  } catch {
    return null;
  }
  const followedAt = time(v.followedAt);
  if (typeof v.title !== 'string' || !v.title.trim() || followedAt === null)
    return null;
  let seen: Fingerprint | null = null;
  if (isRecord(v.seen)) {
    seen = {};
    for (const [key, reading] of Object.entries(v.seen)) {
      const decoded = decodeReading(reading);
      if (decoded) seen[key] = decoded;
    }
  }
  return {
    kind,
    id,
    title: v.title,
    followedAt,
    seen,
    seenAt: seen ? time(v.seenAt) : null,
    ...(Array.isArray(v.seenKeys)
      ? {
          seenKeys: [
            ...new Set(
              v.seenKeys.filter((k): k is string => typeof k === 'string'),
            ),
          ].slice(0, 50),
        }
      : {}),
  };
}
/** The saved list, keeping only well-formed, distinct follows up to the cap. */
export function decodeFollows(v: unknown): SavedFollow[] {
  if (!isRecord(v) || v.version !== 1 || !Array.isArray(v.follows)) return [];
  const seen = new Set<string>();
  const out: SavedFollow[] = [];
  for (const row of v.follows) {
    const follow = decodeFollow(row);
    if (!follow || seen.has(followKey(follow))) continue;
    seen.add(followKey(follow));
    out.push(follow);
    if (out.length === FOLLOW_LIMIT) break;
  }
  return out;
}

// The slot holding the newest saved copy, and its number; slot -1 is none.
let newest = { slot: -1, generation: 0 };
let topicNewest = { slot: -1, generation: 0 };
// Saturates at three and survives unfollowing, clearing and app restarts.
let firstFollowCount = 0;
let primaryEntries: SavedFollow[] = [];
let topicEntries: SavedFollow[] = [];
async function readFollows(): Promise<Follow[]> {
  const decode = (raw: unknown) =>
    isRecord(raw) && raw.version === 1 && Array.isArray(raw.follows)
      ? decodeFollows(raw)
      : null;
  let savedCount: number | undefined;
  const [copy, topics] = await Promise.all([
    readCopies(SLOTS, (raw) => {
      const follows = decode(raw);
      return follows === null
        ? null
        : { follows, count: isRecord(raw) ? raw.firstFollowCount : undefined };
    }),
    readCopies(TOPIC_SLOTS, decode),
  ]);
  newest = { slot: copy.slot, generation: copy.generation };
  topicNewest = { slot: topics.slot, generation: topics.generation };
  const seed = copy.value == null ? await seededFollows() : null;
  primaryEntries = seed ?? copy.value?.follows ?? [];
  savedCount =
    typeof copy.value?.count === 'number' &&
    Number.isInteger(copy.value.count) &&
    copy.value.count >= 0
      ? copy.value.count
      : undefined;
  // Existing installs start with their saved follow count, never a reset.
  firstFollowCount = Math.min(3, savedCount ?? primaryEntries.length);
  if (seed) newest = writeCopy(SLOTS, newest, { version: 1, follows: seed });
  topicEntries = topics.value ?? [];
  return [...primaryEntries, ...topicEntries].filter(isKnownFollow);
}
function writeFollows(follows: Follow[]) {
  const next = new Map(follows.map((f) => [followKey(f), f]));
  const topics = topicEntries.flatMap<SavedFollow>((f) =>
    isKnownFollow(f)
      ? next.has(followKey(f))
        ? [next.get(followKey(f))!]
        : []
      : [f],
  );
  const topicKeys = new Set(topicEntries.map(followKey));
  const primaryKeys = new Set(primaryEntries.map(followKey));
  const primary = [
    ...primaryEntries.flatMap<SavedFollow>((f) =>
      isKnownFollow(f)
        ? next.has(followKey(f))
          ? [next.get(followKey(f))!]
          : []
        : [f],
    ),
    ...follows.filter(
      (f) => !topicKeys.has(followKey(f)) && !primaryKeys.has(followKey(f)),
    ),
  ];
  // Ordinarily only the primary file changes. Leave future/topic bytes alone.
  if (JSON.stringify(primary) !== JSON.stringify(primaryEntries)) {
    const added = primary.filter((f) => !primaryKeys.has(followKey(f))).length;
    const nextCount = Math.min(3, firstFollowCount + added);
    newest = writeCopy(SLOTS, newest, {
      version: 1,
      follows: primary,
      firstFollowCount: nextCount,
    });
    firstFollowCount = nextCount;
    primaryEntries = primary;
  }
  if (JSON.stringify(topics) !== JSON.stringify(topicEntries)) {
    topicNewest = writeCopy(TOPIC_SLOTS, topicNewest, {
      version: 1,
      follows: topics,
    });
    topicEntries = topics;
  }
}

let state: Follow[] | null = null;
let loading: Promise<Follow[]> | null = null;
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
export function loadFollows(): Promise<Follow[]> {
  loading ??= readFollows().then((follows) => {
    state ??= follows;
    emit();
    return state;
  });
  return loading.then(() => state!);
}
/**
 * Changes run one at a time and are saved before they show. A save that
 * fails leaves the list as it was and rejects.
 */
function update<T>(change: (follows: Follow[]) => [Follow[], T]): Promise<T> {
  const run = queue.then(async () => {
    const current = await loadFollows();
    const [next, result] = change(current);
    if (next !== current) {
      writeFollows(next);
      state = next;
      emit();
    }
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}
export type FollowResult = 'followed' | 'already' | 'limit';
type FollowItem = {
  kind: FollowKind;
  id: string;
  title: string;
};
export function follow(item: FollowItem): Promise<FollowResult> {
  return followWithFeedback(item).then((result) => result.status);
}
/** The confirmation decision belongs to the same serial save as the follow. */
export function followWithFeedback(item: {
  kind: FollowKind;
  id: string;
  title: string;
}): Promise<{ status: FollowResult; showMessage: boolean }> {
  return update<{ status: FollowResult; showMessage: boolean }>((follows) => {
    if (follows.some((f) => followKey(f) === followKey(item)))
      return [follows, { status: 'already', showMessage: false }];
    const allKeys = new Set(
      [...primaryEntries, ...topicEntries].map(followKey),
    );
    if (allKeys.size >= FOLLOW_LIMIT)
      return [follows, { status: 'limit', showMessage: false }];
    return [
      [
        ...follows,
        {
          kind: item.kind,
          id: ids[item.kind](item.id),
          title: item.title,
          followedAt: Date.now(),
          seen: null,
          seenAt: null,
        },
      ],
      { status: 'followed', showMessage: firstFollowCount < 3 },
    ];
  }).then((result) => {
    // Only a follow that was saved; "already" and "limit" change nothing.
    if (result.status === 'followed')
      track('opax_follow', { action: 'follow', kind: item.kind });
    return result;
  });
}
export function unfollow(key: string): Promise<void> {
  return update((follows) => {
    const next = follows.filter((f) => followKey(f) !== key);
    const removed = next.length !== follows.length;
    return [removed ? next : follows, removed];
  }).then((removed) => {
    // The key's kind prefix only ("person"), never its ID.
    if (removed)
      track('opax_follow', { action: 'unfollow', kind: key.split(':')[0] });
  });
}
export function clearFollows(): Promise<void> {
  return update((follows) => [follows.length ? [] : follows, undefined]);
}
const sameReading = (a: Reading | undefined, b: Reading) =>
  !!a && a.value === b.value && a.asAt === b.asAt && a.words === b.words;
/**
 * Records what the reader has now seen. Markers that could not be read this
 * time keep their earlier value, so a failed catalog never hides a change.
 * Nothing is written when every marker is already as seen.
 */
export function markSeen(
  key: string,
  current: Fingerprint,
  keys?: readonly string[],
): Promise<void> {
  return update((follows) => {
    const index = follows.findIndex((f) => followKey(f) === key);
    const was = follows[index];
    if (!was) return [follows, undefined];
    const memberKeys = new Set(
      was.kind === 'party'
        ? [
            ...(was.seen?.members?.records ?? []),
            ...(current.members?.records ?? []),
          ].map((record) => record.key)
        : [],
    );
    const activeKeys = new Set(
      currentKeys({ ...(was.seen ?? {}), ...current }),
    );
    const candidates = [
      ...new Set([...(keys ?? []), ...(was.seenKeys ?? [])]),
    ].filter((key) => !memberKeys.has(key));
    const seenKeys =
      keys === undefined
        ? was.seenKeys
        : [
            ...candidates.filter((key) => activeKeys.has(key)),
            ...candidates.filter((key) => !activeKeys.has(key)),
          ].slice(0, 50);
    const unchanged =
      was.seen !== null &&
      Object.entries(current).every(([k, r]) => sameReading(was.seen![k], r)) &&
      JSON.stringify(seenKeys) === JSON.stringify(was.seenKeys);
    if (unchanged) return [follows, undefined];
    const next = [...follows];
    next[index] = {
      ...was,
      seen: { ...(was.seen ?? {}), ...current },
      seenAt: Date.now(),
      ...(seenKeys !== undefined ? { seenKeys } : {}),
    };
    return [next, undefined];
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** The saved follows, or null while the file is read. */
export function useFollows(): Follow[] | null {
  const follows = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    void loadFollows();
  }, []);
  return follows;
}
/** Tests only: forget the in-memory list so the next read uses the file. */
export function resetFollowsForTests() {
  state = null;
  loading = null;
  queue = Promise.resolve();
  newest = { slot: -1, generation: 0 };
  topicNewest = { slot: -1, generation: 0 };
  primaryEntries = [];
  topicEntries = [];
  firstFollowCount = 0;
}
/** Marks every ready follow using the shared catalogs already read by follows. */
export async function markAllSeen(): Promise<void> {
  // Keep the local store independent of build-bound services until requested.
  const { catalogs } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../api/runtime') as typeof import('../../api/runtime');
  const { followState, needsFor } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./markers') as typeof import('./markers');
  const follows = await loadFollows();
  const sources = await catalogs.followSources(needsFor(follows));
  for (const follow of follows) {
    const state = followState(follow, sources);
    if (state.status === 'ready')
      await markSeen(followKey(follow), state.current, state.keys);
  }
}

export interface StoredFollowResult {
  version: 1;
  shape: 'collapsed' | 'expanded';
  checkedAt: number;
  states: [string, FollowState][];
  sourceDates: Record<string, string | null>;
}
/** Describes the visible change set, independent of check time or row order. */
export function followResultKey(
  result: Pick<StoredFollowResult, 'states'>,
): string {
  return JSON.stringify(
    result.states
      .flatMap(([key, state]) =>
        state.status === 'ready'
          ? state.changes
              .filter((c) => c.today !== false)
              .map(
                (c) => `${key}|${c.key ?? c.marker}|${c.text}|${c.asAt ?? ''}`,
              )
          : [],
      )
      .sort(),
  );
}
const resultStore = new TwoSlotStore<StoredFollowResult>(
  ['opax-follows-today-v1.json', 'opax-follows-today-v1.b.json'],
  (raw) => {
    if (
      !isRecord(raw) ||
      raw.version !== 1 ||
      !['collapsed', 'expanded'].includes(String(raw.shape)) ||
      !time(raw.checkedAt) ||
      !Array.isArray(raw.states) ||
      !isRecord(raw.sourceDates)
    )
      return null;
    for (const entry of raw.states) {
      if (
        !Array.isArray(entry) ||
        typeof entry[0] !== 'string' ||
        !isRecord(entry[1])
      )
        return null;
      const state = entry[1];
      if (state.status === 'ready') {
        if (
          typeof state.title !== 'string' ||
          !isRecord(state.current) ||
          !Array.isArray(state.keys) ||
          !state.keys.every((k) => typeof k === 'string') ||
          !Array.isArray(state.changes)
        )
          return null;
        for (const change of state.changes)
          if (
            !isRecord(change) ||
            typeof change.text !== 'string' ||
            typeof change.marker !== 'string' ||
            typeof change.citation !== 'string' ||
            !(change.asAt === null || typeof change.asAt === 'string')
          )
            return null;
      } else if (state.status !== 'missing' && state.status !== 'unavailable')
        return null;
    }
    return {
      version: 1,
      shape: raw.shape,
      checkedAt: raw.checkedAt,
      states: raw.states,
      sourceDates: raw.sourceDates,
    } as StoredFollowResult;
  },
  (value) => value,
);
export function loadFollowResult(): Promise<StoredFollowResult | null> {
  return resultStore.read();
}
export function saveFollowResult(result: StoredFollowResult): Promise<void> {
  return resultStore.save(result);
}
