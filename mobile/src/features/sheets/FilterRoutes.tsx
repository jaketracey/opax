import { useState, useSyncExternalStore } from 'react';
import {
  router,
  Stack,
  useLocalSearchParams,
  useNavigation,
} from 'expo-router';
import { FilterSheet, FilterFacet, filterBar } from '../../design/filter-sheet';
import { ContentUnavailable } from '../../design/states';
import { useStackChrome } from '../../navigation/chrome';
import type { FilterList } from '../../navigation/routes/filters';
import { filterModels, ensureFilterModel } from './filter-models';
import { beginFilterSession } from './filter-model';

export function FiltersLayout() {
  return (
    <Stack
      screenOptions={{ ...useStackChrome(), headerLargeTitleEnabled: false }}
    >
      <Stack.Screen name="[list]" options={{ title: 'Filters' }} />
      <Stack.Screen
        name="[list]/[facet]"
        options={{ headerBackTitle: 'Filters' }}
      />
    </Stack>
  );
}
function knownList(list: string | undefined): list is FilterList {
  return !!list && Object.hasOwn(filterModels, list);
}
function MissingFilters() {
  return (
    <>
      <Stack.Screen
        options={{ title: 'Filters', ...filterBar(() => router.back()) }}
      />
      <ContentUnavailable
        title="Nothing to show"
        symbol="line.3.horizontal.decrease.circle"
      />
    </>
  );
}
export function FilterRoute() {
  const { list, owner } = useLocalSearchParams<{
    list?: string;
    owner?: string;
  }>();
  if (!knownList(list)) return <MissingFilters />;
  return (
    <BoundFilters key={`${list}:${owner ?? ''}`} list={list} owner={owner} />
  );
}
function BoundFilters({ list, owner }: { list: FilterList; owner?: string }) {
  const [store] = useState(() => ensureFilterModel(list, owner));
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [session] = useState(() => beginFilterSession(store));
  return (
    <FilterSheet
      model={store.model}
      value={state}
      owner={owner}
      onChange={store.set}
      onDone={() => router.back()}
      onCancel={() => {
        session.cancel();
        router.back();
      }}
    />
  );
}
export function FilterFacetRoute() {
  const { list, facet, owner } = useLocalSearchParams<{
    list?: string;
    facet?: string;
    owner?: string;
  }>();
  if (!knownList(list)) return <MissingFilters />;
  return (
    <BoundFacet
      key={`${list}:${owner ?? ''}:${facet}`}
      list={list}
      facet={facet ?? ''}
      owner={owner}
    />
  );
}
function BoundFacet({
  list,
  facet,
  owner,
}: {
  list: FilterList;
  facet: string;
  owner?: string;
}) {
  const [store] = useState(() => ensureFilterModel(list, owner));
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const navigation = useNavigation();
  return (
    <FilterFacet
      model={store.model}
      facet={facet}
      value={state}
      onChange={store.set}
      onBack={() => router.back()}
      onDone={() => navigation.getParent()?.goBack()}
    />
  );
}
