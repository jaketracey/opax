import { FlatList, Pressable, StyleSheet } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Divider, Icon, Text } from '../../design/primitives';
import { colors, layout, minimumTarget, rhythm } from '../../design/tokens';
import { directorySorts } from './model';
import { directoryKind, directoryStore, useDirectoryState } from './store';
export default function DirectoryChoice() {
  const { kind: input, field } = useLocalSearchParams<{
      kind: string;
      field: string;
    }>(),
    kind = directoryKind(input),
    { filters, facets } = useDirectoryState(kind),
    facet = facets.find((f) => f.key === field);
  const choices =
    field === 'sort'
      ? directorySorts[kind]
      : [{ value: '', label: 'All' }, ...(facet?.choices ?? [])];
  const selected =
    filters[field] || (field === 'sort' ? directorySorts[kind][0]!.value : '');
  return (
    <>
      <Stack.Screen
        options={{
          title: field === 'sort' ? 'Sort' : (facet?.label ?? 'Choose'),
          headerLargeTitleEnabled: false,
        }}
      />
      <FlatList
        testID="directory-choice-screen"
        style={styles.screen}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        data={choices}
        keyExtractor={(c) => c.value}
        ItemSeparatorComponent={() => <Divider variant="subtle" />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === item.value }}
            accessibilityLabel={item.label}
            testID={`directory-choice-${item.value || 'all'}`}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.sunken },
            ]}
            onPress={() => {
              directoryStore.set(kind, { ...filters, [field]: item.value });
              router.back();
            }}
          >
            <Text wordSafe style={styles.label}>
              {item.label}
            </Text>
            {selected === item.value ? <Icon name="checkmark" /> : null}
          </Pressable>
        )}
      />
    </>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingBottom: rhythm.section,
  },
  row: {
    minHeight: minimumTarget,
    paddingVertical: rhythm.heading,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  label: { flex: 1 },
});
