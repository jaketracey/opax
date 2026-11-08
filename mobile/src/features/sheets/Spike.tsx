import { Stack, router } from 'expo-router';
import { ScrollView } from 'react-native';
import { Text } from '../../design/text';
import { colors, rhythm } from '../../design/tokens';
import { nativeSearchBarOptions } from '../../design/search-bar';
import { closeSheetItem, headerItems } from '../../navigation/chrome';

/** Temporary capture targets. /source is the detent spike; /citation is seat search. */
export function SheetSpike({ search = false }: { search?: boolean }) {
  return (
    <>
      <Stack.Screen
        options={{
          title: search ? 'Your electorate' : 'Sources',
          presentation: 'formSheet',
          headerShown: true,
          headerLargeTitleEnabled: false,
          sheetAllowedDetents: search ? [1] : [0.5, 1],
          sheetGrabberVisible: true,
          sheetExpandsWhenScrolledToEdge: true,
          ...headerItems(() => [closeSheetItem()]),
          ...(search
            ? {
                unstable_headerLeftItems: () => [
                  {
                    type: 'button' as const,
                    label: 'Cancel',
                    onPress: () => router.back(),
                  },
                ],
                headerSearchBarOptions: nativeSearchBarOptions({
                  placeholder: 'Name or electorate',
                  autoFocus: true,
                  onChangeText: () => {},
                  onSearchButtonPress: () => {},
                  onCancelButtonPress: () => router.back(),
                }),
              }
            : {}),
        }}
      />
      <ScrollView
        testID={search ? 'sheet-spike-search' : 'sheet-spike-detents'}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: colors.sunken }}
        contentContainerStyle={{ padding: rhythm.screen, gap: rhythm.group }}
      >
        {Array.from({ length: 32 }, (_, index) => (
          <Text key={index} variant="body">
            {search
              ? `Electorate suggestion ${index + 1}`
              : `Original record ${index + 1}`}
          </Text>
        ))}
      </ScrollView>
    </>
  );
}
