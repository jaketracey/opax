import { useEffect, useSyncExternalStore } from 'react';
import { File, Paths } from 'expo-file-system';
import { writeAsStringAsync } from 'expo-file-system/legacy';
import { billKey, electorateId, personId } from '../../api/ids';

/**
 * Local follows: what this iPhone follows and the change markers it last
 * showed for each. Saved in the app's documents beside the saved seat; never
 * sent anywhere. Device backups may include the file.
 */
export type FollowKind = 'person' | 'bill' | 'electorate';
/** One marker as last seen: a comparable value, its words and its date. */
export interface Reading {
  value: string | number | null;
  /** Words for "was …" lines, such as names or a party. */
  words?: string;
  asAt: string | null;
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
}
export const FOLLOW_LIMIT = 50;
export const followKey = (f: { kind: FollowKind; id: string }) =>
  `${f.kind}:${f.id}`;
const ids: Record<FollowKind, (v: unknown) => string> = {
  person: personId,
  bill: billKey,
  electorate: electorateId,
};

const FILE = 'opax-follows-v1.json';
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
  };
}
function decodeFollow(v: unknown): Follow | null {
  if (!isRecord(v)) return null;
  const kind = v.kind as FollowKind;
  if (!Object.hasOwn(ids, kind)) return null;
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
  };
}
/** The saved list, keeping only well-formed, distinct follows up to the cap. */
export function decodeFollows(v: unknown): Follow[] {
  if (!isRecord(v) || v.version !== 1 || !Array.isArray(v.follows)) return [];
  const seen = new Set<string>();
  const out: Follow[] = [];
  for (const row of v.follows) {
    const follow = decodeFollow(row);
    if (!follow || seen.has(followKey(follow))) continue;
    seen.add(followKey(follow));
    out.push(follow);
    if (out.length === FOLLOW_LIMIT) break;
  }
  return out;
}

async function readFollows(): Promise<Follow[]> {
  try {
    const saved = new File(Paths.document, FILE);
    if (!saved.exists) return [];
    return decodeFollows(JSON.parse(await saved.text()));
  } catch {
    return [];
  }
}
// One atomic replacement (Data.write(.atomic) in the legacy writer): the old
// list stays whole until the new one is in place. File.move with overwrite
// deletes the old file first, so a failure there would lose every follow.
function writeFollows(follows: Follow[]) {
  return writeAsStringAsync(
    new File(Paths.document, FILE).uri,
    JSON.stringify({ version: 1, follows }),
  );
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
      await writeFollows(next);
      state = next;
      emit();
    }
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}
export type FollowResult = 'followed' | 'already' | 'limit';
export function follow(item: {
  kind: FollowKind;
  id: string;
  title: string;
}): Promise<FollowResult> {
  return update((follows) => {
    if (follows.some((f) => followKey(f) === followKey(item)))
      return [follows, 'already'];
    if (follows.length >= FOLLOW_LIMIT) return [follows, 'limit'];
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
      'followed',
    ];
  });
}
export function unfollow(key: string): Promise<void> {
  return update((follows) => {
    const next = follows.filter((f) => followKey(f) !== key);
    return [next.length === follows.length ? follows : next, undefined];
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
export function markSeen(key: string, current: Fingerprint): Promise<void> {
  return update((follows) => {
    const index = follows.findIndex((f) => followKey(f) === key);
    const was = follows[index];
    if (!was) return [follows, undefined];
    const unchanged =
      was.seen !== null &&
      Object.entries(current).every(([k, r]) => sameReading(was.seen![k], r));
    if (unchanged) return [follows, undefined];
    const next = [...follows];
    next[index] = {
      ...was,
      seen: { ...(was.seen ?? {}), ...current },
      seenAt: Date.now(),
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
}
