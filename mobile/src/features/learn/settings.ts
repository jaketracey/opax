import { useSyncExternalStore } from 'react';
import { tourSeen } from '../../onboarding/state';
import { TwoSlotStore } from '../../storage/two-slot';
import { learnFixture } from './launch-fixture';

/**
 * "How Parliament works" settings, device-only and never sent anywhere.
 *
 * - `underline`: inline glossary terms (a dotted underline on a term's first
 *   use on a screen). ON for everyone, existing installs included (Jake,
 *   14 Nov); Account › Underline terms turns it off.
 * - `explain`: option C's plain line under a section heading. OFF unless the
 *   reader asked for the basics on the welcome page (ad-newcomer-c sets it);
 *   Account › Explain terms changes it either way.
 * - `card`: the Home first-run guide card. `show` only on a NEW install (no
 *   file and the welcome not yet seen when the store is first read); its
 *   close button or opening the guide set `hidden` for good. An existing
 *   install starts at `never` and never sees it.
 */
export interface LearnSettings {
  underline: boolean;
  explain: boolean;
  card: 'show' | 'hidden' | 'never';
}
interface LearnFile extends Partial<LearnSettings> {
  version: 1;
}

const defaults: LearnSettings = {
  underline: true,
  explain: false,
  card: 'never',
};

const store = new TwoSlotStore<LearnFile>(
  ['opax-learn-v1.json', 'opax-learn-v1.b.json'],
  (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as Record<string, unknown>;
    if (value.version !== 1) return null;
    const file: LearnFile = { version: 1 };
    if (typeof value.underline === 'boolean') file.underline = value.underline;
    if (typeof value.explain === 'boolean') file.explain = value.explain;
    if (
      value.card === 'show' ||
      value.card === 'hidden' ||
      value.card === 'never'
    )
      file.card = value.card;
    return file;
  },
  (value) => value,
);

let current: LearnSettings = defaults;
let loaded = false;
let loading: Promise<LearnSettings> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/**
 * Reads the file once. With no file at all, the install is new exactly when
 * the welcome has not been seen yet; the answer is written straight away so
 * a later launch (welcome seen by then) keeps it.
 */
export function loadLearnSettings(): Promise<LearnSettings> {
  loading ??= (async () => {
    let file: LearnFile | null = null;
    try {
      file = await store.read();
    } catch {
      file = null;
    }
    if (!file) {
      const seen = await tourSeen().catch(() => true);
      file = { version: 1, card: seen ? 'never' : 'show' };
      void store.save(file).catch(() => undefined);
    }
    // A change made before the read finished wins over the file; an e2e
    // launch argument wins over both (captures only).
    const next = { ...defaults, ...strip(file), ...pending, ...learnFixture() };
    pending = {};
    loaded = true;
    // The same answers keep the same snapshot: nothing redraws for nothing.
    if (!same(next, current)) {
      current = next;
      emit();
    }
    return current;
  })();
  return loading;
}
let pending: Partial<LearnSettings> = {};
const same = (a: LearnSettings, b: LearnSettings) =>
  a.underline === b.underline && a.explain === b.explain && a.card === b.card;
function strip(file: LearnFile): Partial<LearnSettings> {
  const { version: _version, ...rest } = file;
  return rest;
}

async function update(change: Partial<LearnSettings>) {
  if (!loaded) pending = { ...pending, ...change };
  current = { ...current, ...change };
  emit();
  await loadLearnSettings();
  await store.save({ version: 1, ...current }).catch(() => undefined);
}

export function subscribeLearnSettings(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded) void loadLearnSettings();
  return () => {
    listeners.delete(listener);
  };
}
export function learnSettingsSnapshot(): LearnSettings {
  return current;
}

export function useLearnSettings(): LearnSettings {
  return useSyncExternalStore(
    subscribeLearnSettings,
    learnSettingsSnapshot,
    learnSettingsSnapshot,
  );
}
/** One setting, so a change to another (the Home card) redraws nothing. */
function useLearnSetting<K extends keyof LearnSettings>(
  key: K,
): LearnSettings[K] {
  const read = () => current[key];
  return useSyncExternalStore(subscribeLearnSettings, read, read);
}
/** Inline glossary terms: on unless the reader turned them off. */
export function useUnderlineTerms(): boolean {
  return useLearnSetting('underline');
}
/** Option C's plain lines under headings: off unless the reader asked. */
export function useExplainTerms(): boolean {
  return useLearnSetting('explain');
}
/** Home's first-run guide card: `show` on a new install only. */
export function useLearnCard(): LearnSettings['card'] {
  return useLearnSetting('card');
}

export function setUnderlineTerms(on: boolean): Promise<void> {
  return update({ underline: on });
}
/** The welcome's answer (ad-newcomer-c) and Account › Explain terms. */
export function setExplainTerms(on: boolean): Promise<void> {
  return update({ explain: on });
}
/** The Home card's close button, and opening the guide: hidden for good. */
export async function hideLearnCard(): Promise<void> {
  await loadLearnSettings();
  if (current.card === 'show') await update({ card: 'hidden' });
}

/** Tests only. */
export function resetLearnSettingsForTests(
  value: Partial<LearnSettings> | null = null,
) {
  current = { ...defaults, ...value };
  loaded = value !== null;
  loading = value !== null ? Promise.resolve(current) : null;
  pending = {};
  listeners.clear();
}
