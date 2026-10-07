import { Alert } from 'react-native';
import { router } from 'expo-router';
import { fromWebPath } from '../src/navigation/routes';
import { openOnWeb, openSource } from '../src/navigation/external';
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());
test.each([
  '/doc/speech-1205524',
  '/doc/division-federal-senate-10701',
  '/doc/press-pmt-example',
  '/doc/grant-site-evidence-ga566033',
  '#/doc/speech-1205524',
])('web record path resolves natively: %s', (path) =>
  expect(fromWebPath(path)?.pathname).toBe('/doc/[slug]'),
);
test.each([
  '/doc/speech-1?ask=x',
  '/doc/../api/ask',
  '/doc/private-1',
  '/doc/%73peech-1',
  '/doc/',
  '/doc/speech-1/extra',
])('unsafe or non-public document path cannot resolve: %s', (path) =>
  expect(fromWebPath(path)).toBeNull(),
);
test('record source URLs and legacy fragment URLs open in the native reader', async () => {
  await openSource('https://opax.com.au/doc/speech-1205524');
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/doc/[slug]',
    params: { slug: 'speech-1205524' },
  });
  await openSource('https://opax.com.au/#/doc/division-federal-senate-10701');
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/doc/[slug]',
    params: { slug: 'division-federal-senate-10701' },
  });
  await openOnWeb('/doc/press-pmt-example', 'Release');
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/doc/[slug]',
    params: { slug: 'press-pmt-example' },
  });
});
test('bill version deep links preserve the chosen version and homepage index anchor opens recent', () => {
  expect(
    fromWebPath(
      '/bill/au-federal-r7534?text-version=r7534-first-reps#bill-full-text',
    ),
  ).toEqual({
    pathname: '/bill-text/[key]',
    params: { key: 'au-federal-r7534', version: 'r7534-first-reps' },
  });
  expect(fromWebPath('/#hp-indexed-title')?.pathname).toBe('/recent-records');
});
test('native resolution still checks credentials and the complete external destination', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await openSource('https://opax.com.au/doc/speech-1?token=secret');
  await openOnWeb('/doc/speech-1?ask=x', 'Read');
  expect(router.push).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledTimes(2);
  alert.mockRestore();
});
