import { Stack } from 'expo-router';
import { rootBackTitle, screen, sheetOptions, untitled } from './screen';

export function publicMoneyScreens() {
  return [
    screen('public-money', 'Public money'),
    screen('leads', 'Leads'),
    screen('lead/[id]', 'Lead'),
    screen('discover', 'Leads'),
    screen('grants', 'Commonwealth grants', untitled),
    screen('grant-program', 'Grant program'),
    screen('largest-grants', 'Largest grants', untitled),
    screen('agencies', 'Government agencies', untitled),
    screen('agency', 'Government agency'),
    screen('connections', 'Programs and places', untitled),
    screen('grants-allocation', 'Community funding', untitled),
    screen('money-record', 'Money record', untitled),
    <Stack.Screen
      key="money-item"
      name="money-item"
      options={({ route, navigation }) => ({
        title: 'Money record',
        ...untitled,
        ...(rootBackTitle(navigation, route.key)
          ? { headerBackTitle: rootBackTitle(navigation, route.key) }
          : {}),
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
