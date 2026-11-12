import { redirectSystemPath } from '../src/app/+native-intent';
import { fromWebPath } from '../src/navigation/external';
import {
  vicElectionRoute,
  vicSeatRoute,
} from '../src/navigation/routes/vic-election';
import { setSelectedTab } from '../src/navigation/link-tab';
test('web and app election links resolve inside the current tab', () => {
  expect(fromWebPath('/vic-election-2026')).toEqual(vicElectionRoute());
  expect(fromWebPath('/vic-election-2026/albert-park')).toEqual(
    vicSeatRoute('albert-park'),
  );
  expect(fromWebPath('/vic-election-2026?place=St%20Kilda')).toEqual(
    vicElectionRoute('St Kilda'),
  );
  expect(
    redirectSystemPath({ path: 'opax:///vic-election', initial: true }),
  ).toBe('/(tabs)/(today)/vic-election');
  expect(
    redirectSystemPath({
      path: 'opax:///vic-election/albert-park',
      initial: true,
    }),
  ).toBe('/(tabs)/(today)/vic-election/albert-park');
  setSelectedTab('(search)');
  expect(
    redirectSystemPath({
      path: 'https://opax.com.au/vic-election-2026?place=3350',
      initial: false,
    }),
  ).toBe('/(tabs)/(search)/vic-election?q=3350');
  expect(fromWebPath('/vic-election-2026/Bad_slug')).toBeNull();
  expect(fromWebPath('/vic-election-2026/%2e%2e')).toBeNull();
});
