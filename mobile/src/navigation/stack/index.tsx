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
import { filtersScreens } from './filters';
import { referenceSharedScreens } from './reference';

export const tabSettings = {
  anchor: 'index',
  'your-mp': { anchor: 'your-mp' },
  bills: { anchor: 'bills' },
  search: { anchor: 'search' },
  ask: { anchor: 'ask' },
};
export function sharedScreens(segment: string, signedIn: boolean) {
  return [
    ...todayScreens(segment, signedIn),
    ...editionScreens(),
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
    ...filtersScreens(),
  ];
}
