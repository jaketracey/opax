import { screen } from './screen';

/**
 * `/seat`: the chooser's own small stack inside the root page sheet. Its
 * bar items (Cancel, the search field) are set by `SeatChooser`, which owns
 * the one-Cancel rule (first-launch 4.6).
 */
export function seatScreens() {
  return [
    screen('index', 'Your electorate'),
    screen('state/[code]', 'Electorates'),
  ];
}
/**
 * `/welcome`: the welcome page (no bar), then the pushed seat step with its
 * bar. The page's title "Welcome" names the seat step's back button, which
 * draws as the chevron alone (first-launch 4.2 A2).
 */
export function welcomeScreens() {
  return [
    screen('index', 'Welcome', {
      headerShown: false,
      scrollEdgeEffects: { top: 'hidden', bottom: 'soft' },
    }),
    // Newcomer design pass (prototype): option A's cards, option C's page.
    screen('tour', 'The basics', {
      headerShown: true,
      headerBackButtonDisplayMode: 'minimal',
    }),
    screen('basics', 'The basics', {
      headerShown: true,
      headerBackButtonDisplayMode: 'minimal',
    }),
    screen('seat/index', 'Your electorate', {
      headerShown: true,
      headerBackButtonDisplayMode: 'minimal',
    }),
    screen('seat/state/[code]', 'Electorates', { headerShown: true }),
  ];
}
