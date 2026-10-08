import { Platform } from 'react-native';

/** Telemetry label only. The catalog transport policy is platform independent. */
export function catalogUserAgent(version: string, build: string): string {
  return `OPAX-${Platform.OS === 'android' ? 'Android' : 'iOS'}/${version} (${build})`;
}
