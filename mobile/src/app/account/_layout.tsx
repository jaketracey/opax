import { Stack } from 'expo-router';
import { closeSheetItem, useStackChrome } from '../../navigation/chrome';
export default function AccountStack() {
  const chrome = useStackChrome();
  return (
    <Stack screenOptions={chrome}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Account and about',
          unstable_headerRightItems: () => [closeSheetItem()],
        }}
      />
      <Stack.Screen name="about" options={{ title: 'About OPAX' }} />
      <Stack.Screen
        name="sources"
        options={{ title: 'Sources and licences' }}
      />
    </Stack>
  );
}
