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
export const kindLabel = (kind: CatalogKind) =>
  searchKinds.find((k) => k.value === kind)!.label;
