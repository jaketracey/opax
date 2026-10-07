import { useLocalSearchParams } from 'expo-router';
import Search from '../../../features/Search';
import {
  defaultFilters,
  sorts,
  type SearchFilters,
} from '../../../features/search/contracts';
export default function SearchRoute() {
  const params = useLocalSearchParams<Record<string, string>>();
  const filters = params.kind
    ? (Object.fromEntries(
        Object.keys(defaultFilters).map((k) => [
          k,
          params[k] ?? defaultFilters[k as keyof SearchFilters],
        ]),
      ) as SearchFilters)
    : undefined;
  return (
    <Search
      key={JSON.stringify(params)}
      initialQuery={params.q ?? ''}
      initialFilters={filters}
      initialSort={
        sorts.find((s) => s.value === params.sort)?.value ?? 'relevance'
      }
      initialPage={Number(params.page) || 1}
    />
  );
}
