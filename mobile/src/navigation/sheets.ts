import { router, useLocalSearchParams } from 'expo-router';
import type { Href, NativeStackHeaderItem } from 'expo-router';
import type { ReactNode } from 'react';
import type { SourceDetails } from '../design/source';
import type { MachineNote } from '../design/labels';
import {
  sourceRoute,
  machineNoteRoute,
  citationRoute,
  ruleRoute,
} from './routes/sheets';

/** Slots owned by Ask. Content and callbacks stay in memory, never in a URL. */
export interface Citation {
  number?: number;
  content?: ReactNode;
  previous?: () => void;
  next?: () => void;
  menu?: Extract<NativeStackHeaderItem, { type: 'menu' }>;
}
export type SheetPayload =
  | { kind: 'source'; details: SourceDetails; testID?: string }
  | { kind: 'machine'; note: MachineNote; testID?: string }
  | { kind: 'citation'; citation: Citation; testID?: string }
  | {
      kind: 'rule';
      title?: string;
      rule: string;
      sources?: SourceDetails;
      extra?: ReactNode;
      testID?: string;
    }
  | {
      kind: 'table';
      title: string;
      rows: { label: string; value: string }[];
      sources?: SourceDetails;
      testID?: string;
    };
type Entry = SheetPayload & { overModal: boolean };
const payloads = new Map<string, Entry>();
const registryId = Math.random().toString(36).slice(2);
let serial = 0;
let overModal = false;
let aboveTabs = false;

/** Root layout supplies segments once, including sheets presented over a modal. */
export function setSheetSegments(segments: readonly string[]) {
  const first = segments.find((segment) => !segment.startsWith('('));
  if (
    [
      'source',
      'citation',
      'machine-note',
      'rule',
      'licences',
      'term',
      'term-tip',
    ].includes(first ?? '')
  )
    return;
  overModal = first === 'account' || first === 'talk' || first === 'licence';
  aboveTabs = overModal || first === 'welcome' || first === 'seat';
}
/**
 * True while a full-screen or modal stack (Account, Talk, the welcome, the
 * electorate step) is on top: a sheet opened there can't push a tab page.
 */
export function sheetAboveTabs(): boolean {
  return aboveTabs;
}
export function sheetPayload<K extends SheetPayload['kind']>(
  key: string | undefined,
  kind: K,
): (Extract<SheetPayload, { kind: K }> & { overModal: boolean }) | null {
  const payload = key ? payloads.get(key) : null;
  return payload?.kind === kind
    ? (payload as Extract<SheetPayload, { kind: K }> & { overModal: boolean })
    : null;
}
export function presentSheet(payload: SheetPayload): void {
  const key = `sheet-${registryId}-${++serial}`;
  payloads.set(key, { ...payload, overModal });
  if (payloads.size > 8) payloads.delete(payloads.keys().next().value!);
  const route = {
    source: sourceRoute({ key }),
    machine: machineNoteRoute({ key }),
    citation: citationRoute({ key }),
    rule: ruleRoute({ key }),
    table: ruleRoute({ key, variant: 'table' }),
  }[payload.kind];
  router.push(route);
}
/** How long UIKit takes to dismiss a sheet, with room (as TalkScreen waits). */
export const SHEET_DISMISS_MS = 500;
let leaving = false;

/**
 * Closes the sheet on top, then runs `next` once it is safe to navigate.
 *
 * A page (`'page'`): two frames later, so the push lands in a later commit
 * than the close. Closed and pushed in one commit, the new page was laid out
 * in the closing sheet's frame and kept it: a short sheet (a glossary term,
 * a rule) left the page it opened drawn in the top half of the screen, the
 * rest blank, on every iOS (A to Z glossary from a term, iPhone 16 Pro on
 * iOS 18.4 and iPhone 17 Pro on iOS 26.3). The sheet still slides away as
 * the page arrives.
 *
 * Another sheet (`'sheet'`): only after the dismissal has ended. Two frames
 * in, the first sheet is still being dismissed, and react-native-screens
 * drops a modal presented then (RNSScreenStack.mm, `beingDismissed`) and
 * leaves its stack waiting, so no later sheet opens there either. No event
 * reaches JS when a sheet closed from JS has gone, so this waits out the
 * dismissal.
 *
 * A second call while one is pending is ignored: a double tap must not close
 * two screens or open the page twice.
 */
export function leaveSheetThen(
  next: () => void,
  target: 'page' | 'sheet' = 'page',
): void {
  if (leaving) return;
  leaving = true;
  router.back();
  const run = () => {
    leaving = false;
    next();
  };
  if (target === 'sheet') setTimeout(run, SHEET_DISMISS_MS);
  else requestAnimationFrame(() => requestAnimationFrame(run));
}
/** Closes the sheet on top and opens `href` beneath it (see leaveSheetThen). */
export function pushBeneathSheet(
  href: Href,
  target: 'page' | 'sheet' = 'page',
): void {
  leaveSheetThen(() => router.push(href), target);
}
export function presentSource(
  details: SourceDetails,
  options: { testID?: string } = {},
) {
  presentSheet({ kind: 'source', details, ...options });
}
export function useSheetPayload<K extends SheetPayload['kind']>(kind: K) {
  const { key } = useLocalSearchParams<{ key?: string }>();
  return sheetPayload(key, kind);
}
