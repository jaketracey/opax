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
import type { TabSegment } from '../chrome';

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
export function sharedScreens(segment: string, signedIn: boolean) {
  const screens = [
    ...todayScreens(segment, signedIn),
    ...editionScreens(),
    ...vicElectionScreens(),
    ...yourMpScreens(segment, signedIn),
    ...peopleScreens(),
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
    ...screens.filter((screen) => screen.props.name !== root),
  ];
}
