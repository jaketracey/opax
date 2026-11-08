import { todayPaths } from './today';
import { editionPaths } from './edition';
import { seatPaths } from './seat';
import { yourMpPaths } from './your-mp';
import { peoplePaths } from './people';
import { billsPaths } from './bills';
import { recordsPaths } from './records';
import { referencePaths } from './reference';
import { searchPaths } from './search';
import { askPaths } from './ask';
import { moneyMapPaths } from './money-map';
import { publicMoneyPaths } from './public-money';
import { accountPaths } from './account';
import { explorePaths } from './explore';
import { filtersPaths } from './filters';
import { sheetsPaths } from './sheets';
const paths = [
  ...todayPaths,
  ...editionPaths,
  ...seatPaths,
  ...yourMpPaths,
  ...peoplePaths,
  ...billsPaths,
  ...recordsPaths,
  ...referencePaths,
  ...searchPaths,
  ...askPaths,
  ...moneyMapPaths,
  ...publicMoneyPaths,
  ...accountPaths,
  ...explorePaths,
  ...filtersPaths,
  ...sheetsPaths,
];
/** The resolver contains no presentation or group policy. */
export function fromWebPath(path: string) {
  if (!path.startsWith('/') && !path.startsWith('#/')) return null;
  if (path.startsWith('//')) return null;
  try {
    // Incoming names never become trusted native back-button text.
    const [base, query] = path.split('?');
    if (query && new URLSearchParams(query.split('#')[0]).has('name')) {
      const [search, hash] = query.split('#');
      const p = new URLSearchParams(search);
      p.delete('name');
      path = `${base}${p.size ? `?${p}` : ''}${hash ? `#${hash}` : ''}`;
    }
    for (const resolve of paths) {
      const route = resolve(path);
      if (route) return route;
    }
  } catch {
    /* Malformed incoming paths stay outside native navigation. */
  }
  return null;
}
