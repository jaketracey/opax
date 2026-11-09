import { useNetworkState } from 'expo-network';

/** Device connectivity only: NWPathMonitor / ConnectivityManager, no HTTP probe,
 * IP address, location, saved identifier or server read. Unknown stays usable. */
export function useOffline(): boolean {
  const state = useNetworkState();
  return state.isConnected === false || state.isInternetReachable === false;
}
