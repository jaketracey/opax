import { Stack } from 'expo-router';
import { screen, sheetOptions } from './screen';

export function publicMoneyScreens() {
  return [
    screen('public-money', 'Public money'),
    screen('leads', 'Leads'),
    screen('lead/[id]', 'Lead'),
    screen('discover', 'Leads'),
    screen('grants', 'Commonwealth grants'),
    screen('grant-program', 'Grant program'),
    screen('largest-grants', 'Largest grants'),
    screen('agencies', 'Government agencies'),
    screen('agency', 'Government agency'),
    screen('connections', 'Programs and places'),
    screen('grants-allocation', 'Community funding'),
    screen('money-record', 'Money record'),
    <Stack.Screen
      key="money-item"
      name="money-item"
      options={({ route }) => ({
        title: 'Money record',
        ...((route.params as { sheet?: string } | undefined)?.sheet === '1'
          ? sheetOptions
          : {}),
      })}
    />,
    screen('money-donors', 'Donors'),
    screen('funding-by-seat-type', 'Funding by seat type'),
    screen('agency-list', 'Agency records'),
    screen('connection', 'Programs and places'),
  ];
}
