import { useLocalSearchParams } from 'expo-router';
import { isPad } from '../../../design/primitives';
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
  // On iPad the split writes its selection (`open`) and the query (`q`) to
  // the route; neither starts the search again (Search applies a new `q`).
  const { open: _open, ...rest } = params;
  const { q: _q, ...withoutQuery } = rest;
  return (
    <Search
      key={JSON.stringify(isPad ? withoutQuery : params)}
      initialQuery={params.q ?? ''}
      initialFilters={filters}
      initialSort={
        sorts.find((s) => s.value === params.sort)?.value ?? 'relevance'
      }
      initialPage={Number(params.page) || 1}
    />
  );
}
