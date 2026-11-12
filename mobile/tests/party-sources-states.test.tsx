// Largest sources by year: a failed receipts read or an unknown party is
// not "No sources disclosed".
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { catalogs } from '../src/api/runtime';
import { ContentUnavailable } from '../src/design/states';
import PartySources from '../src/features/people/PartySources';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ name: 'Fixture Party' }),
  useIsPreview: () => false,
  router: { push: jest.fn() },
}));
jest.mock('../src/navigation/preview', () => ({ RouteOptions: () => null }));
jest.mock('../src/api/runtime', () => ({ catalogs: { partyPage: jest.fn() } }));

const page = (data: unknown) =>
  ({ data, stale: false, savedAt: 1, asOf: null }) as never;
const receipts = (status: string) => ({
  label: 'Fixture Party',
  receipts: { status, data: null, sources: [], asAt: null },
});

async function mount() {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(<PartySources />);
  });
  return view;
}
const state = (view: TestRenderer.ReactTestRenderer) =>
  view.root.findByType(ContentUnavailable).props;

test('a failed receipts read offers Try again rather than an empty record', async () => {
  jest
    .mocked(catalogs.partyPage)
    .mockResolvedValueOnce(page(receipts('error')))
    .mockResolvedValueOnce(page(receipts('ready')));
  const view = await mount();
  expect(state(view).title).toBe('Couldn’t load largest sources');
  await act(async () => state(view).action.onPress());
  expect(catalogs.partyPage).toHaveBeenCalledTimes(2);
  expect(state(view).title).toBe('No sources disclosed');
  await act(async () => view.unmount());
});

test('an unknown party says so rather than claiming no sources', async () => {
  jest.mocked(catalogs.partyPage).mockResolvedValueOnce(page(null));
  const view = await mount();
  expect(state(view).title).toBe('This party isn’t in OPAX’s records yet');
  await act(async () => view.unmount());
});
