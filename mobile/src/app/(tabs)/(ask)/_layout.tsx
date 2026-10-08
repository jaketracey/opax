import { headerItems } from '../../../navigation/chrome';
import { Stack } from 'expo-router';
import {
  closeSheetItem,
  shortSheet,
  useStackChrome,
} from '../../../navigation/chrome';
export const unstable_settings = { anchor: 'ask' };
export default function AskLayout() {
  return (
    <Stack
      screenOptions={{ ...useStackChrome(), headerLargeTitleEnabled: true }}
    >
      <Stack.Screen name="ask" />
      <Stack.Screen
        name="follows"
        options={{ title: 'Following', headerLargeTitleEnabled: false }}
      />
      <Stack.Screen
        name="expense-glossary"
        options={{
          title: 'Expense glossary',
          ...shortSheet,
          headerLargeTitleEnabled: false,
          ...headerItems(() => [closeSheetItem()]),
        }}
      />
    </Stack>
  );
}
