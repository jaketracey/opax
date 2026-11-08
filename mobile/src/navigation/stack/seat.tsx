import { router } from 'expo-router';
import { screen } from './screen';

export function seatScreens() {
  return [
    screen('index', 'Your electorate', {
      unstable_headerLeftItems: () => [
        { type: 'button', label: 'Cancel', onPress: () => router.back() },
      ],
    }),
    screen('state/[code]', 'Electorates'),
  ];
}
export function welcomeScreens() {
  return [
    screen('index', 'Welcome'),
    screen('seat/index', 'Your electorate'),
    screen('seat/state/[code]', 'Electorates'),
  ];
}
