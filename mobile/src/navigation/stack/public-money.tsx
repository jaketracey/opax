import { Stack } from 'expo-router';
import {
  detailBackOptions,
  rootBackTitle,
  screen,
  sheetOptions,
  untitled,
} from './screen';

export function publicMoneyScreens() {
  return [
    screen('public-money', 'Public money'),
    screen('leads', 'Leads'),
    screen('lead/[id]', '', untitled),
    screen('discover', 'Leads'),
    screen('grants', 'Commonwealth grants', untitled),
    screen('grant-program', '', untitled),
    screen('largest-grants', 'Largest grants', untitled),
    screen('agencies', 'Government agencies', untitled),
    screen('agency', '', untitled),
    screen('connections', 'Programs and places', untitled),
    screen('grants-allocation', 'Community funding', untitled),
    screen('money-record', 'Money record', untitled),
    <Stack.Screen
      key="money-item"
      name="money-item"
      options={({ route, navigation }) => ({
        title: '',
        ...untitled,
        ...(rootBackTitle(navigation, route.key)
          ? { headerBackTitle: rootBackTitle(navigation, route.key) }
          : {}),
        ...detailBackOptions(navigation, route.key, 'money-item'),
        ...((route.params as { sheet?: string } | undefined)?.sheet === '1'
          ? sheetOptions
          : {}),
      })}
    />,
    screen('money-donors', 'Donors'),
    screen('funding-by-seat-type', 'Funding by seat type'),
    screen('agency-list', 'Agency records'),
    screen('connection', '', untitled),
  ];
}
