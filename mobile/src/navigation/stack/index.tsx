import { vicElectionScreens } from './vic-election';
import { todayScreens } from './today';
import { editionScreens } from './edition';
import { yourMpScreens } from './your-mp';
import { peopleScreens } from './people';
import { billsScreens } from './bills';
import { recordsScreens } from './records';
import { searchScreens } from './search';
import { askScreens } from './ask';
import { moneyMapScreens } from './money-map';
import { publicMoneyScreens } from './public-money';
import { exploreScreens } from './explore';
import { learnScreens } from './learn';
import { filtersScreens } from './filters';
import { referenceSharedScreens } from './reference';
import { cloneElement, type ReactElement } from 'react';
import type { NativeStackNavigationOptions } from 'expo-router';
import { solidRailBar, type TabSegment } from '../chrome';

const tabRoots = {
  '(today)': 'index',
  '(your-mp)': 'your-mp',
  '(bills)': 'bills',
  '(search)': 'search',
  '(ask)': 'ask',
} as const satisfies Record<TabSegment, string>;

export function tabRootName(segment: string) {
  return tabRoots[segment as TabSegment] ?? 'index';
}

// Expo Router 57.0.24 reads these per-group initial routes in
// getRoutesCore.js. Set the navigator's initialRouteName too, so ordinary
// tab selection and incoming links build the same stack.
export const tabSettings = {
  initialRouteName: tabRoots['(today)'],
  today: { initialRouteName: tabRoots['(today)'] },
  'your-mp': { initialRouteName: tabRoots['(your-mp)'] },
  bills: { initialRouteName: tabRoots['(bills)'] },
  search: { initialRouteName: tabRoots['(search)'] },
  ask: { initialRouteName: tabRoots['(ask)'] },
};
export function sharedScreens(
  segment: string,
  signedIn: boolean,
  /** Pushed pages run under the bar (useStackChrome's `tabStack`). */
  underBar = false,
) {
  const screens = [
    ...todayScreens(segment, signedIn),
    ...editionScreens(underBar),
    ...vicElectionScreens(),
    ...yourMpScreens(segment, signedIn),
    ...peopleScreens(underBar),
    ...billsScreens(segment, signedIn),
    ...recordsScreens(),
    ...referenceSharedScreens(),
    ...searchScreens(segment, signedIn),
    ...askScreens(segment, signedIn),
    ...moneyMapScreens(),
    ...publicMoneyScreens(),
    ...exploreScreens(),
    ...learnScreens(),
    ...filtersScreens(),
  ];
  const root = tabRootName(segment);
  return [
    ...screens.filter((screen) => screen.props.name === root),
    ...screens
      .filter((screen) => screen.props.name !== root)
      .map((screen) =>
        underBar && railSearchRoutes.has(screen.props.name)
          ? withSolidRailBar(screen)
          : screen,
      ),
  ];
}

/**
 * Pushed pages whose bar always holds a search field. Beside a vertical bar
 * such a bar is solid (see RouteOptions), and the page says so only once it
 * has rendered: the pushed Bills list was drawn under the clear bar for a
 * frame and laid out again below the solid one, redrawing its scope control
 * (1 of 2 opens on the simulator). Their routes carry the solid bar from the
 * stack's first layout, as the directory and Just declared already do.
 */
const railSearchRoutes = new Set([
  'bill-list',
  'person/[slug]/votes',
  'division-history',
  'grants',
  'grant-program',
  'agencies',
  'learn/glossary',
]);

type StackScreen = ReactElement<{
  name: string;
  options: (props: object) => NativeStackNavigationOptions;
}>;
function withSolidRailBar(screen: StackScreen) {
  const { options } = screen.props;
  return cloneElement(screen, {
    options: (props: object) => ({ ...options(props), ...solidRailBar(true) }),
  });
}
