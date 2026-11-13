import { Platform } from 'react-native';
import {
  consumeInitialAndroidLink,
  hasAndroidLinkCapture,
} from '../navigation/link-readiness';
import { resolveSystemPath } from '../navigation/system-path';

/** Cold links use Router's initial state; buffered warm links use its API. */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  if (Platform.OS === 'android' && hasAndroidLinkCapture()) {
    // Entry capture owns warm events so Router's native listener cannot
    // dispatch them before the app's navigator has mounted.
    if (!initial) return '';
    consumeInitialAndroidLink(path);
  }
  return resolveSystemPath({ path, initial });
}
