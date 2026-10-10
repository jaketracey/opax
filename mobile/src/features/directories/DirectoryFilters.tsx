import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  Button,
  LinkRow,
  RowList,
  Screen,
  Section,
  SwitchRow,
} from '../../design/primitives';
import { closeSheetItem } from '../../navigation/chrome';
import { sortSummary } from './model';
import { directoryKind, directoryStore, useDirectoryState } from './store';
export default function DirectoryFilters() {
  const { kind: input } = useLocalSearchParams<{ kind: string }>();
  const kind = directoryKind(input),
    { filters, facets } = useDirectoryState(kind);
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Filters and sort',
          headerLargeTitleEnabled: false,
          unstable_headerRightItems: () => [closeSheetItem()],
        }}
      />
      <Screen testID="directory-filters-screen">
        <Section title="Filter the list" accent="people" rule={false}>
          <RowList>
            {facets.map((f) =>
              f.choices ? (
                <LinkRow
                  key={f.key}
                  title={f.label}
                  value={
                    f.choices.find((c) => c.value === filters[f.key])?.label ??
                    'All'
                  }
                  testID={`directory-filter-${f.key}`}
                  onPress={() =>
                    router.push({
                      pathname: '/directory-filters/choice',
                      params: { kind, field: f.key },
                    })
                  }
                />
              ) : (
                <SwitchRow
                  key={f.key}
                  label={f.label}
                  value={!!filters[f.key]}
                  testID={`directory-filter-${f.key}`}
                  onValueChange={() =>
                    directoryStore.set(kind, {
                      ...filters,
                      [f.key]: filters[f.key] ? '' : '1',
                    })
                  }
                />
              ),
            )}
          </RowList>
        </Section>
        <Section title="Sort" accent="people">
          <LinkRow
            title={sortSummary(kind, filters.sort)}
            testID="directory-filter-sort"
            onPress={() =>
              router.push({
                pathname: '/directory-filters/choice',
                params: { kind, field: 'sort' },
              })
            }
          />
        </Section>
        <Button
          label="Clear filters"
          variant="quiet"
          testID="directory-filters-clear"
          onPress={() => directoryStore.set(kind, {})}
        />
      </Screen>
    </>
  );
}
