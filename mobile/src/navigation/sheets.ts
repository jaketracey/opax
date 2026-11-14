import { router, useLocalSearchParams } from 'expo-router';
import type { NativeStackHeaderItem } from 'expo-router';
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

/** Root layout supplies segments once, including sheets presented over a modal. */
export function setSheetSegments(segments: readonly string[]) {
  const first = segments.find((segment) => !segment.startsWith('('));
  if (
    ['source', 'citation', 'machine-note', 'rule', 'licences', 'plain-words'].includes(
      first ?? '',
    )
  )
    return;
  overModal = first === 'account' || first === 'talk' || first === 'licence';
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
