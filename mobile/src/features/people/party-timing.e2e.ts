// Local Release/e2e timing probe; Metro excludes this file from production.
import Constants from 'expo-constants';
let startedAt: number | null = null;
export function startPartyTiming() {
  if (Constants.expoConfig?.extra?.variant === 'e2e')
    startedAt = performance.now();
}
export function partyTimingID() {
  return startedAt === null
    ? undefined
    : 'people-party-title-ms-' + Math.round(performance.now() - startedAt);
}
