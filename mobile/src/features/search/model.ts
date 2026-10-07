import type { rosterIdentityFor } from '../../api/selectors';
import { chamberName, jurisdictionName } from '../../design/parliament';
import type { CatalogKind } from '../../api/policy';
import type { suggestionsFor } from '../../api/catalogs';
export const searchKinds: readonly {
  value: CatalogKind;
  label: string;
  testID: string;
}[] = [
  { value: 'person', label: 'People', testID: 'search-kind-person' },
  {
    value: 'interest',
    label: 'Declared interests',
    testID: 'search-kind-interest',
  },
  { value: 'pay', label: 'Pay', testID: 'search-kind-pay' },
  { value: 'expense', label: 'Expenses', testID: 'search-kind-expense' },
];
export type Suggestions = ReturnType<typeof suggestionsFor>;
export const groupSuggestions = (data: Suggestions) => [
  { kind: 'people' as const, label: 'People', rows: data.people },
  {
    kind: 'electorates' as const,
    label: 'Electorates',
    rows: data.electorates,
  },
  { kind: 'bills' as const, label: 'Bills', rows: data.bills },
];
export type SearchKind =
  | CatalogKind
  | 'records'
  | 'party'
  | 'agency'
  | 'grant'
  | 'report'
  | 'bill';
export const scopeKinds = [
  ...searchKinds,
  {
    value: 'records' as const,
    label: 'Records',
    testID: 'search-kind-records',
  },
  {
    value: 'party' as const,
    label: 'Political parties',
    testID: 'search-kind-party',
  },
  {
    value: 'agency' as const,
    label: 'Government agencies',
    testID: 'search-kind-agency',
  },
  { value: 'grant' as const, label: 'Grants', testID: 'search-kind-grant' },
  { value: 'bill' as const, label: 'Bills', testID: 'search-kind-bill' },
  {
    value: 'report' as const,
    label: 'Research reports',
    testID: 'search-kind-report',
  },
];
export const kindLabel = (kind: SearchKind) =>
  scopeKinds.find((k) => k.value === kind)!.label;

/** Reader-facing context from the roster selector, including historical parties. */
export function personRowContext(
  person: ReturnType<typeof rosterIdentityFor> | null,
) {
  const place = person?.representation.length
    ? person.representation
        .map((r) => {
          const seat = r.electorate.trim();
          const chamber = chamberName(r.chamber, r.jurisdiction);
          const state = jurisdictionName(
            r.state ??
              (r.jurisdiction === 'federal' ? undefined : r.jurisdiction),
          );
          const parts = [
            seat,
            chamber,
            state && state !== seat && !chamber?.startsWith(state)
              ? state
              : null,
          ].filter(Boolean);
          const label = parts.join(' · ');
          return r.current ? label : `Recorded representation: ${label}`;
        })
        .join('; ')
    : person?.chambers.length
      ? [
          ...person.chambers.map((c) => chamberName(c)),
          ...person.states.map((s) => jurisdictionName(s)),
        ]
          .filter(Boolean)
          .join(' · ')
      : undefined;
  return {
    party: person?.party,
    partyStatus: person?.partyStatus ?? ('unknown' as const),
    formerly: person?.formerly,
    place: place || undefined,
  };
}
