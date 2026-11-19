import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

/**
 * The reader's own appearance for OPAX (20 Nov 2026): Match phone, Light or
 * Dark, chosen in the Account sheet.
 *
 * The choice is a small file in the app's documents, on this device only. It
 * is read synchronously while the root layout's module loads, so the first
 * frame is already drawn in the chosen appearance. It is applied with
 * `Appearance.setColorScheme`, an app-wide override that native parts follow
 * too (alerts, pickers, the keyboard, every DynamicColorIOS role), and that
 * `Appearance.getColorScheme()` then reports, so `useColors()` on Android
 * and `useIsDark()` follow with no change of their own.
 *
 * Only a build that follows the system offers it (plugins/appearance.js,
 * read here as the Expo config's `userInterfaceStyle`). A light-only build
 * never reads the file and never overrides anything, so a choice stored by
 * another build cannot turn it dark.
 */
export type AppearanceChoice = 'system' | 'light' | 'dark';
export const appearanceChoices: readonly AppearanceChoice[] = [
  'system',
  'light',
  'dark',
];

const FILE = 'opax-appearance-v1.json';
const file = () => new File(Paths.document, FILE);

/** Whether this build follows the system, and so offers the setting. */
export function appearanceSettingOffered(): boolean {
  return Constants.expoConfig?.userInterfaceStyle === 'automatic';
}

/**
 * What React Native's override takes for a choice. In 0.86 `unspecified`
 * hands the app back to the system.
 */
export function colorSchemeFor(
  choice: AppearanceChoice,
): 'light' | 'dark' | 'unspecified' {
  return choice === 'system' ? 'unspecified' : choice;
}

/** A stored document's choice; anything unreadable or unknown is `system`. */
export function decodeAppearance(text: string): AppearanceChoice {
  try {
    const raw: unknown = JSON.parse(text);
    const value =
      raw && typeof raw === 'object'
        ? (raw as { appearance?: unknown }).appearance
        : undefined;
    return appearanceChoices.find((choice) => choice === value) ?? 'system';
  } catch {
    return 'system';
  }
}

function readStored(): AppearanceChoice {
  try {
    const stored = file();
    return stored.exists ? decodeAppearance(stored.textSync()) : 'system';
  } catch {
    return 'system';
  }
}

function apply(next: AppearanceChoice) {
  try {
    Appearance.setColorScheme(colorSchemeFor(next));
  } catch {
    /* The system's appearance stays; the app still starts. */
  }
}

let choice: AppearanceChoice = 'system';
const listeners = new Set<() => void>();

/**
 * Once, while the root layout's module loads and before anything draws: read
 * the stored choice and apply it. Match phone, the default, overrides
 * nothing, so a reader who never opens the setting gets what they always had.
 */
export function startAppearance() {
  choice = appearanceSettingOffered() ? readStored() : 'system';
  if (choice !== 'system') apply(choice);
}

/** The reader's choice now. Always `system` in a light-only build. */
export function appearanceChoice(): AppearanceChoice {
  return choice;
}

/**
 * Change the choice: the whole app follows at once, and the choice is kept
 * for the next launch. A failed save still holds for this session.
 */
export function setAppearance(next: AppearanceChoice) {
  if (!appearanceSettingOffered() || next === choice) return;
  choice = next;
  apply(next);
  try {
    file().write(JSON.stringify({ appearance: next }));
  } catch {
    /* Kept in memory; the next launch falls back to the last saved one. */
  }
  for (const changed of [...listeners]) changed();
}

function subscribe(changed: () => void) {
  listeners.add(changed);
  return () => {
    listeners.delete(changed);
  };
}

/** The choice for the rows that show it, drawn again when it changes. */
export function useAppearanceChoice(): AppearanceChoice {
  return useSyncExternalStore(subscribe, appearanceChoice, appearanceChoice);
}
