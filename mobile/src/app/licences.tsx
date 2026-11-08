import { Stack } from 'expo-router';
import { SourcesScreen } from '../features/sources/SourcesScreen';
import { closeSheetItem, headerItems } from '../navigation/chrome';

export default function LicencesSheet() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Sources and licences',
          presentation: 'modal',
          ...headerItems(() => [closeSheetItem()]),
        }}
      />
      <SourcesScreen />
    </>
  );
}
