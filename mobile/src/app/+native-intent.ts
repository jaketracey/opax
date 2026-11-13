import { Platform } from 'react-native';
import {
  hasAndroidLinkCapture,
  initialAndroidLink,
  linkDeliveryPath,
} from '../navigation/link-readiness';
import { resolveSystemPath } from '../navigation/system-path';

/** Native delivery IDs reconcile cold navigation with the durable warm FIFO. */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  if (Platform.OS === 'android' && hasAndroidLinkCapture()) {
    if (!initial) return '';
    const delivery = initialAndroidLink();
    // A retained OS URL may already be consumed. It cannot reopen a page.
    if (!delivery) return '/';
    const destination = resolveSystemPath({
      path: delivery.url,
      initial: true,
    });
    return linkDeliveryPath(destination, delivery.id);
  }
  return resolveSystemPath({ path, initial });
}
