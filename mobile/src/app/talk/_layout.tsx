import { Stack } from 'expo-router';
import { closeSheetItem, headerItems, useStackChrome } from '../../navigation/chrome';

export default function TalkStack() {
  return <Stack screenOptions={{ ...useStackChrome(), headerLargeTitleEnabled: false }}>
    <Stack.Screen name="index" options={{ title: 'Talk to OPAX', ...headerItems(() => [closeSheetItem()]) }} />
  </Stack>;
}
