import { Stack } from 'expo-router';
import { closeSheetItem, useStackChrome } from '../../../../navigation/chrome';
export default function DirectoryFilterStack() {
  const chrome = useStackChrome();
  return (
    <Stack screenOptions={{ ...chrome, headerLargeTitleEnabled: false }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Filters and sort',
          unstable_headerRightItems: () => [closeSheetItem()],
        }}
      />
      <Stack.Screen name="choice" options={{ title: 'Choose' }} />
    </Stack>
  );
}
