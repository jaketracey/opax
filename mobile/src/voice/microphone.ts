import Constants from 'expo-constants';
import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Android's microphone permission, asked by Talk after consent and a
 * rationale, never at launch (README.md, "Android microphone permission").
 * `blocked` is "Don't ask again": only Settings can turn it on.
 */
export type MicrophoneAccess = 'granted' | 'denied' | 'blocked';

/**
 * Android production voice builds ask from JS before `start()`. iOS asks in
 * its native `start()` with the purpose string, which only its production
 * build embeds; e2e uses the native synthetic input and development never
 * opens the hardware microphone, on both platforms.
 */
export function asksForMicrophone(): boolean {
  return (
    Platform.OS === 'android' &&
    Constants.expoConfig?.extra?.productionVoiceEnabled === true
  );
}

// "Don't ask again" in this app session: Start goes straight to Settings.
let blocked = false;

/** Whether Talk may start without asking. Never shows a dialog. */
export async function microphoneGranted(): Promise<boolean> {
  if (!asksForMicrophone()) return true;
  try {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (granted) blocked = false;
    return granted;
  } catch {
    return false;
  }
}

export const microphoneBlocked = () => blocked;

/**
 * The system dialog, after the rationale only. Android answers "Don't ask
 * again" at once, without a dialog, until Settings turns access back on.
 */
export async function requestMicrophone(): Promise<MicrophoneAccess> {
  if (!asksForMicrophone()) return 'granted';
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    blocked = result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
    if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    return blocked ? 'blocked' : 'denied';
  } catch {
    return 'denied';
  }
}
