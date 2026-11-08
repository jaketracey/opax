import type { WebPathResolver } from './types';
import {
  aboutRoute,
  coverageRoute,
  licenceRoute,
  methodsRoute,
} from '../routes/reference';

import { ActionSheetIOS, Linking, Platform } from 'react-native';
import { OpaxShare } from '../../../modules/opax-share';
import { haptic } from '../../design/haptics';
import * as AndroidMenu from '../../design/menu';
/** The 1.0 licence link: Sources and licences opened at one dataset. */
const datasetLink = /^\/account\/sources\/?\?(?:[^#]*&)?dataset=([^&#]+)/;
export const referencePaths = [
  (path) => {
    const [base] = path.split(/[?#]/);
    if (base === '/stats' || base === '/stats/') return coverageRoute;
    if (base === '/methods' || base === '/methods/') return methodsRoute;
    if (base === '/about' || base === '/about/') return aboutRoute;
    // Cached 1.0 source sheets and web links open the Licence sheet, never
    // the Account sheet (account.md 4.4 "Old links").
    const dataset = datasetLink.exec(path)?.[1];
    if (dataset) return licenceRoute(decodeURIComponent(dataset));
    return null;
  },
] satisfies WebPathResolver[];

export async function openCorrection(): Promise<void> {
  const address = 'corrections@opax.com.au';
  const copy = () => {
    void OpaxShare?.copyText(address).then(() => haptic('success'));
  };
  try {
    if (await Linking.canOpenURL('mailto:')) {
      await Linking.openURL(`mailto:${address}`);
      return;
    }
  } catch {
    /* Offer the address when there is no Mail handler. */
  }
  if (Platform.OS === 'android')
    AndroidMenu.showMenu(address, [{ title: 'Copy address', onPress: copy }]);
  else
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: address,
        options: ['Copy address', 'Cancel'],
        cancelButtonIndex: 1,
      },
      (index) => {
        if (index === 0) copy();
      },
    );
}
