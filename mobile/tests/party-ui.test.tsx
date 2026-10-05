import { act } from 'react';
import { Text as NativeText, useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import { catalogs as runtime } from '../src/api/runtime';
import { Catalogs } from '../src/api/catalogs';
import { PartySplits, RecordedParty } from '../src/features/bills/parts';
import { PartyPage } from '../src/features/Party';
import { PartyLabel, PersonRow } from '../src/design/people';
import { openOnWeb } from '../src/navigation/external';
import { partyRoute } from '../src/navigation/routes';
import { pinned, slugs } from './pinned';
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({ catalogs: { partyPage: jest.fn() } }));
jest.mock('../src/navigation/external', () => ({
  openOnWeb: jest.fn(),
  openSource: jest.fn(),
  sourceUrl: (s: string) => s,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const api = new Catalogs({
  get: async (path, decoder) => ({
    data: decoder(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});
let view: Awaited<ReturnType<typeof api.partyPage>>;
beforeAll(async () => {
  view = await api.partyPage('Labor');
});
beforeEach(() => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  jest.clearAllMocks();
  jest.mocked(runtime.partyPage).mockResolvedValue(view);
});
async function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<PartyPage input="Labor" />);
  });
  return renderer;
}
const press = (r: TestRenderer.ReactTestRenderer, id: string) =>
  act(() =>
    r.root
      .find(
        (n) => n.props.testID === id && typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );
test('profile chips and grouped person-row VoiceOver actions open the same native party route', () => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <PartyLabel party="Labor" status="current" testID="chip" />,
    );
  });
  press(r, 'chip');
  expect(router.push).toHaveBeenCalledWith(partyRoute('Labor'));
  act(() => {
    r.update(
      <PersonRow
        name="Anthony Albanese"
        party="Labor"
        partyStatus="current"
        onPress={() => undefined}
        testID="person"
      />,
    );
  });
  const row = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'person',
  );
  expect(row.props.accessibilityActions).toContainEqual({
    name: 'openParty',
    label: 'Open Labor party page',
  });
  act(() =>
    row.props.onAccessibilityAction({
      nativeEvent: { actionName: 'openParty' },
    }),
  );
  expect(router.push).toHaveBeenLastCalledWith(partyRoute('Labor'));
  act(() => r.unmount());
});
test('bill links exclude presiding roles and unrecorded affiliations, including folded splits', () => {
  // UI-only synthetic parties and anonymous roles; no public person's votes
  // or bill record is changed. These rare role codes are register fields.
  const row = (party: string, label: string, ayes = 1) => ({
    party, label, ayes, noes: 0,
  });
  const splits = {
    drawn: Array.from({ length: 5 }, (_, i) =>
      row(`Fixture party ${i + 1}`, `Fixture party ${i + 1}`, 5),
    ),
    folded: [
      row('Fixture small party', 'Fixture small party'),
      row('PRES', 'Presiding officer'),
      row('SPK', 'Speaker'),
      row('', 'Not recorded'),
    ],
    max: 5, notes: [], recorded: true,
  };
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <PartySplits splits={splits} basisNote="" testID="splits" />,
    );
  });
  press(r, 'splits');
  const links = r.root.findAll(
    (n) => typeof n.type === 'string' && n.props.accessibilityRole === 'link',
  );
  expect(links).toHaveLength(6);
  for (const link of links)
    expect(link.props.accessibilityLabel).not.toMatch(
      /^(Presiding officer|Speaker|Not recorded)/,
    );
  for (const party of [' ', 'PRES', 'SPK']) {
    act(() => r.update(<RecordedParty party={party} />));
    expect(
      r.root.findAll((n) => n.props.accessibilityRole === 'link'),
    ).toHaveLength(0);
  }
  act(() => r.unmount());
});
test('member disclosure opens native profiles; the total and every block have provenance', async () => {
  const r = await render();
  press(r, 'party-current-toggle');
  press(r, 'party-member-anthony-albanese');
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/person/[slug]',
    params: { slug: 'anthony-albanese' },
  });
  for (const id of [
    'party-members-as-at',
    'party-receipts-as-at',
    'party-associated-as-at',
    'party-divisions-as-at',
  ])
    expect(r.root.findAll((n) => n.props.testID === id).length).toBeGreaterThan(
      0,
    );
  const total = r.root.find(
    (n) =>
      typeof n.type === 'string' && n.props.testID === 'party-receipts-total',
  );
  expect(total.props.accessibilityLabel).toBe(
    'Received (disclosed), $1,120,198,704',
  );
  act(() => r.unmount());
});
test('AX5 party text remains uncapped and current/recorded disclosures expose their expanded state', async () => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 3.571 });
  const r = await render();
  press(r, 'party-current-toggle');
  press(r, 'party-recorded-toggle');
  for (const text of r.root.findAllByType(NativeText)) {
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.maxFontSizeMultiplier).toBe(0);
  }
  for (const id of ['party-current-toggle', 'party-recorded-toggle']) {
    const control = r.root.find(
      (n) => typeof n.type === 'string' && n.props.testID === id,
    );
    expect(control.props.accessibilityState.expanded).toBe(true);
  }
  act(() => r.unmount());
});
test('authoritative unresolved party follows the web fallback', async () => {
  jest
    .mocked(runtime.partyPage)
    .mockResolvedValue({ data: null, stale: false });
  const r = await render();
  expect(openOnWeb).toHaveBeenCalledWith('/subject/party/Labor', 'Labor');
  act(() => r.unmount());
});
test('failed read offers retry and does not mistake a network failure for an unknown party', async () => {
  jest
    .mocked(runtime.partyPage)
    .mockRejectedValue(new Error('fixture unavailable'));
  const r = await render();
  expect(openOnWeb).not.toHaveBeenCalled();
  expect(
    r.root.findAll((n) => n.props.testID === 'party-error').length,
  ).toBeGreaterThan(0);
  act(() => r.unmount());
});
