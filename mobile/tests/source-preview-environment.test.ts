import { Alert } from 'react-native';
import { openSource } from '../src/navigation/external';
import { sourceDestination } from '../src/navigation/source-destination';
import { hasSourcePreview, isE2E } from '../src/design/environment';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: undefined },
}));
test('unreadable release configuration preserves the local alert without opening a missing route', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const url = 'https://parlinfo.aph.gov.au/';
  expect(isE2E).toBe(true);
  expect(hasSourcePreview).toBe(false);
  await openSource(url, 'ParlInfo bill records');
  expect(alert).toHaveBeenCalledWith(
    'Source record: ParlInfo bill records',
    url,
  );
  expect(sourceDestination()).toBeNull();
  alert.mockRestore();
});
