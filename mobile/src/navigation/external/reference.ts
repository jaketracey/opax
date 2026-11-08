import type { WebPathResolver } from './types';
import { coverageRoute, methodsRoute } from '../routes/reference';

import { ActionSheetIOS, Linking, Platform } from 'react-native';
import { OpaxShare } from '../../../modules/opax-share';
import { haptic } from '../../design/haptics';
import * as AndroidMenu from '../../design/menu';
export const referencePaths = [
  (path) => {
    if (path === '/stats') return coverageRoute;
    if (path === '/methods') return methodsRoute;
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
