import { RouteOptions } from '../../navigation/preview';
import { useState, useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';
import {
  router,
  Stack,
  useLocalSearchParams,
  useNavigation,
  type NativeStackHeaderProps,
} from 'expo-router';
import { FilterSheet, FilterFacet, filterBar } from '../../design/filter-sheet';
import { ContentUnavailable } from '../../design/states';
import { useStackChrome } from '../../navigation/chrome';
import type { FilterList } from '../../navigation/routes/filters';
import { filterModels, ensureFilterModel } from './filter-models';
import { beginFilterSession } from './filter-model';
import { AndroidReadingHeader } from '../../navigation/AndroidReadingHeader';

/**
 * The filters' full-screen dialog sits in a tab stack, where the native safe
 * area view read no top inset: its bar starts below the status bar from the
 * window's insets instead.
 */
export function FiltersHeader(props: NativeStackHeaderProps) {
  return <AndroidReadingHeader {...props} windowInsets />;
}

export function FiltersLayout() {
  const stack = (
    <Stack
      screenOptions={{
        ...useStackChrome(),
        headerLargeTitleEnabled: false,
        ...(Platform.OS === 'android' ? { header: FiltersHeader } : {}),
      }}
    >
      <Stack.Screen
        name="[list]"
        options={({ route }) => ({
          title:
            (route.params as { list?: string } | undefined)?.list === 'ask'
              ? 'Options'
              : 'Filters',
          headerTitleAlign: 'center',
        })}
      />
      <Stack.Screen
        name="[list]/[facet]"
        options={({ route }) => ({
          headerBackTitle:
            (route.params as { list?: string } | undefined)?.list === 'ask'
              ? 'Options'
              : 'Filters',
        })}
      />
    </Stack>
  );
  return Platform.OS === 'android' ? (
    <View
      role="dialog"
      accessibilityLabel="Filters"
      accessibilityViewIsModal
      style={{ flex: 1 }}
    >
      {stack}
    </View>
  ) : (
    stack
  );
}
function knownList(list: string | undefined): list is FilterList {
  return !!list && Object.hasOwn(filterModels, list);
}
function MissingFilters() {
  return (
    <>
      <RouteOptions
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
