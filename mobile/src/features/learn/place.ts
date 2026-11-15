import { useSyncExternalStore } from 'react';
import { TwoSlotStore } from '../../storage/two-slot';

/**
 * The reader's place in "How Parliament works", device-only and never sent
 * anywhere. Per chapter: the idea last shown (`at`, counted from 1) and
 * whether the last idea has been reached (`read`, which stays once set).
 *
 * The guide is still a plain list: nothing locks, nothing is scored and no
 * chapter needs another. The hub only says where the reader stopped and
 * which chapters they have read to the end, and opens a part-read chapter
 * where they left it.
 */
export interface ChapterPlace {
  at: number;
  read: boolean;
}
export type LearnPlaces = Readonly<Record<string, ChapterPlace>>;
interface PlaceFile {
  version: 1;
  chapters: Record<string, ChapterPlace>;
}

/** No more chapters than this are kept; the guide has seven. */
const MAX_CHAPTERS = 40;

const store = new TwoSlotStore<PlaceFile>(
  ['opax-learn-place-v1.json', 'opax-learn-place-v1.b.json'],
  (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const { version, chapters } = raw as Record<string, unknown>;
    if (version !== 1 || !chapters || typeof chapters !== 'object') return null;
    const kept: Record<string, ChapterPlace> = {};
    for (const [slug, value] of Object.entries(chapters).slice(
      0,
      MAX_CHAPTERS,
    )) {
      if (!value || typeof value !== 'object') continue;
      const { at, read } = value as Record<string, unknown>;
      if (typeof at !== 'number' || !Number.isInteger(at) || at < 1) continue;
      kept[slug] = { at, read: read === true };
    }
    return { version: 1, chapters: kept };
  },
  (value) => value,
);

const none: LearnPlaces = {};
let current: LearnPlaces = none;
let loaded = false;
let loading: Promise<LearnPlaces> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Reads the file once; an unreadable file is no place at all. */
export function loadLearnPlaces(): Promise<LearnPlaces> {
  loading ??= (async () => {
    let file: PlaceFile | null = null;
    try {
      file = await store.read();
    } catch {
      file = null;
    }
    // A place kept before the read finished wins over the file's, but a
    // chapter the file says was read stays read.
    const next: Record<string, ChapterPlace> = { ...(file?.chapters ?? {}) };
    for (const [slug, place] of Object.entries(current))
      next[slug] = { at: place.at, read: place.read || !!next[slug]?.read };
    loaded = true;
    if (Object.keys(next).length) {
      current = next;
      emit();
    }
    return current;
  })();
  return loading;
}

/**
 * Keeps the idea now showing. Reaching the chapter's last idea marks it
 * read, and it stays read when the reader goes through it again. The same
 * place twice writes nothing.
 */
export async function keepLearnPlace(
  slug: string,
  at: number,
  total: number,
): Promise<void> {
  if (!Number.isInteger(at) || at < 1 || at > total) return;
  const before = current[slug];
  const read = !!before?.read || at === total;
  if (before && before.at === at && before.read === read) return;
  current = { ...current, [slug]: { at, read } };
  emit();
  await loadLearnPlaces();
  await store.save({ version: 1, chapters: { ...current } });
}

export function subscribeLearnPlaces(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded) void loadLearnPlaces();
  return () => {
    listeners.delete(listener);
  };
}
export const learnPlacesSnapshot = (): LearnPlaces => current;

/** Every chapter's kept place; empty until the file is read. */
export function useLearnPlaces(): LearnPlaces {
  return useSyncExternalStore(
    subscribeLearnPlaces,
    learnPlacesSnapshot,
    learnPlacesSnapshot,
  );
}

/**
 * What the hub says about a chapter, against the chapter as it is now (a
 * later edition of the guide may be shorter than the place kept):
 * - `read`: the last idea was reached;
 * - `part`: the reader stopped at idea `at`, the second or later;
 * - null: not opened, or only its first idea seen.
 */
export function chapterProgress(
  place: ChapterPlace | undefined,
  total: number,
): { kind: 'read' } | { kind: 'part'; at: number } | null {
  if (!place || total < 1) return null;
  if (place.read) return { kind: 'read' };
  const at = Math.min(place.at, total);
  return at >= 2 ? { kind: 'part', at } : null;
}

/** Tests only. */
export function resetLearnPlacesForTests(value: LearnPlaces | null = null) {
  current = value ?? none;
  loaded = value !== null;
  loading = value !== null ? Promise.resolve(current) : null;
  listeners.clear();
}
