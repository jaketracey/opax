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
import { solidRailBar, type TabSegment, type UnderBar } from '../chrome';

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
  underBar: UnderBar = false,
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
    ...askScreens(segment, signedIn, underBar),
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
        underBar === 'plain'
          ? plainSolidRoutes.has(screen.props.name)
            ? withSolidRailBar(screen, underBar)
            : withPresentedBelowBar(screen)
          : underBar && railSearchRoutes.has(screen.props.name)
            ? withSolidRailBar(screen, underBar)
            : screen,
      ),
  ];
}

/**
 * Pushed pages whose bar always holds a search field. Beside a vertical bar
 * (only there: on other layouts these are under the clear bar with the fade)
 * such a bar is solid (see RouteOptions), and the page says so only once it
 * has rendered: the pushed Bills list was drawn under the clear bar for a
 * frame and laid out again below the solid one, redrawing its scope control
 * (1 of 2 opens on the simulator). Their routes carry the solid bar from the
 * stack's first layout, as the directory and Just declared already do.
 *
 * Two money lists with no field are here too (Largest grants, and a seat's
 * grants on the Grants route). Beside a vertical bar the title is pinned
 * (`TitlePin`) and the page's own fade is the edge under it; these lists draw
 * none there, so their rows ran through the title. Under the solid bar
 * the rows end at the title's foot.
 */
const railSearchRoutes = new Set([
  'largest-grants',
  'bill-list',
  'person/[slug]/votes',
  'division-history',
  'grants',
  'grant-program',
  'agencies',
  'learn/glossary',
]);

/**
 * Pushed pages laid out below their bar under the clear bar of a layout
 * without a vertical bar (iOS 26): lists whose section headers pin. React
 * Native pins them at the list's top edge, which a clear bar covers, so
 * these lists start at the bar's foot, and the bar takes the page's ground
 * with no hairline (`groundBar`): it reads as the clear bar, and rows pass
 * under the pinned header, which is its own ground. Just declared and the
 * directory say the same in their own registrations. Every other pushed
 * page there, a search field in its bar or not, is under the clear bar with
 * the fade. The rail's own rule (`railSearchRoutes`) is unchanged.
 */
export const plainSolidRoutes = new Set([
  'person/[slug]/interests',
  'party-sources',
]);

type StackScreen = ReactElement<{
  name: string;
  options: (props: object) => NativeStackNavigationOptions;
}>;
function withSolidRailBar(screen: StackScreen, underBar: UnderBar) {
  const { options } = screen.props;
  return cloneElement(screen, {
    options: (props: object) => ({
      ...options(props),
      ...solidRailBar(underBar),
    }),
  });
}

/**
 * Under the clear bar of a layout without a vertical bar, a sheet or modal
 * registered in the tab's stack keeps the opaque bar its content is laid
 * out below: only the pushed pages run under the bar.
 */
function withPresentedBelowBar(screen: StackScreen) {
  const { options } = screen.props;
  if (!options) return screen;
  return cloneElement(screen, {
    options: (props: object) => {
      const base = typeof options === 'function' ? options(props) : options;
      return base.presentation &&
        base.presentation !== 'card' &&
        !('headerTransparent' in base)
        ? { ...base, headerTransparent: false }
        : base;
    },
  });
}
