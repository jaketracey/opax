import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Button, Group, Screen, Section, Text } from '../../design/primitives';
import { closeSheetItem } from '../../navigation/chrome';
import { directorySorts } from './model';
import { directoryKind, directoryStore, useDirectoryState } from './store';
export default function DirectoryFilters() {
  const { kind: input } = useLocalSearchParams<{ kind: string }>(),
    kind = directoryKind(input),
    { filters, facets } = useDirectoryState(kind);
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Filters and sort',
          presentation: 'modal',
          headerLargeTitleEnabled: false,
          unstable_headerRightItems: () => [closeSheetItem()],
        }}
      />
      <Screen testID="directory-filters-screen">
        <Section title="Filter the list">
          {facets.map((f) => (
            <Group key={f.key}>
              <Text variant="metadata">{f.label}</Text>
              <Button
                testID={`directory-filter-${f.key}`}
                label={
                  f.choices
                    ? (f.choices.find((c) => c.value === filters[f.key])
                        ?.label ?? 'All')
                    : filters[f.key]
                      ? 'Yes'
                      : 'Any'
                }
                onPress={() =>
                  f.choices
                    ? router.push({
                        pathname: '/directory-choice',
                        params: { kind, field: f.key },
                      })
                    : directoryStore.set(kind, {
                        ...filters,
                        [f.key]: filters[f.key] ? '' : '1',
                      })
                }
              />
            </Group>
          ))}
        </Section>
        <Section title="Sort">
          <Button
            label={
              directorySorts[kind].find(
                (s) =>
                  s.value === (filters.sort || directorySorts[kind][0]!.value),
              )!.label
            }
            testID="directory-filter-sort"
            onPress={() =>
              router.push({
                pathname: '/directory-choice',
                params: { kind, field: 'sort' },
              })
            }
          />
        </Section>
        <Button
          label="Clear filters"
          testID="directory-filters-clear"
          onPress={() => directoryStore.set(kind, {})}
        />
      </Screen>
    </>
  );
}
