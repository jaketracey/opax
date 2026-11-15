import { act } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  useWindowDimensions,
} from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { PersonRow } from '../src/design/primitives';
import BillDetail, {
  likelyStatusEvent,
} from '../src/features/bills/BillDetail';
import { statusEventText } from '../src/features/bills/status-event';
import { useFollowStates } from '../src/features/follows/useFollowStates';
import { bills, pinned, slugs } from './pinned';

// The header seeded from the tapped row holds the loaded header's shape, so
// the title, Follow and the body stay where they are when the bill's file
// lands (ad-jank-records, 15 Nov 2026):
// - the status event's placeholder was a fixed 120 x 15 bar; at AX3 the
//   event wraps to two lines and dropped the page 87 pt;
// - a private member's sponsor was two lines of text, then a person row
//   with a portrait and party, and dropped Follow and the body about 70 pt.
const mockParams: { key: string } = { key: 'au-federal-r7534' };
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), setParams: jest.fn() },
  useNavigation: () => ({ setParams: jest.fn() }),
  useIsFocused: () => true,
  Stack: {
    Screen: () => null,
    Toolbar: Object.assign(() => null, {
      Button: () => null,
      Spacer: () => null,
    }),
  },
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    billFor: jest.fn(),
    billIndexRow: jest.fn(),
    directory: jest.fn(),
    votes: jest.fn(),
  },
}));
jest.mock('../src/features/follows/useFollowStates', () => ({
  useFollowStates: jest.fn(),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const fixture = new Catalogs({
  get: async (path, decode) => ({
    data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: Date.now(),
    asOf: null,
  }),
});

let tree: TestRenderer.ReactTestRenderer | null = null;
beforeEach(() => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
  jest.mocked(runtime.directory).mockReset();
  jest.mocked(runtime.directory).mockReturnValue(new Promise(() => {}));
  jest.mocked(useFollowStates).mockReturnValue({
    follows: [],
    states: new Map(),
  } as unknown as ReturnType<typeof useFollowStates>);
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

const host = (testID: string, within: ReactTestInstance = tree!.root) =>
  within.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const words = (node: ReactTestInstance) =>
  node
    .findAllByType(NativeText)
    .map((text) => [text.props.children].flat(Infinity).join(''))
    .join('|');

async function open(key: string) {
  mockParams.key = key;
  const row = bills.bills.find((bill) => bill.key === key)!;
  jest.mocked(runtime.billIndexRow).mockReturnValue(row);
  let arrive!: () => Promise<void>;
  jest.mocked(runtime.billFor).mockImplementation(
    (k, refresh) =>
      new Promise((resolve) => {
        arrive = async () => resolve(await fixture.billFor(k, refresh));
      }),
  );
  await act(async () => {
    tree = TestRenderer.create(<BillDetail />);
  });
  return { row, arrive: () => act(async () => arrive()) };
}

test('the status event is held by its own likely words, unseen, in the event text style', async () => {
  const { arrive } = await open('au-federal-r7534');
  const seed = host('bill-seed')[0]!;
  const pending = host('bill-status-pending', seed);
  expect(pending).toHaveLength(1);
  // Hidden from VoiceOver, and no fixed height: the words size it, so it is
  // one line at standard sizes and two where the event will wrap.
  expect(pending[0]!.props.accessibilityElementsHidden).toBe(true);
  expect(StyleSheet.flatten(pending[0]!.props.style)?.height).toBeUndefined();
  // It takes the status row's own alignment (centred beside the capsule at
  // standard sizes), as the event's words do: an alignment of its own stood
  // it 2 pt above where the words land.
  expect(
    StyleSheet.flatten(pending[0]!.props.style)?.alignSelf,
  ).toBeUndefined();
  const stand = pending[0]!.findAllByType(NativeText);
  expect(stand).toHaveLength(1);
  expect(StyleSheet.flatten(stand[0]!.props.style).opacity).toBe(0);
  const held = [stand[0]!.props.children].flat(Infinity).join('');
  const heldStyle = StyleSheet.flatten(stand[0]!.props.style);
  await arrive();
  expect(host('bill-status-pending')).toHaveLength(0);
  // The loaded event is those words, in that text style.
  const event = host('bill-status')[0]!
    .findAllByType(NativeText)
    .find((text) => [text.props.children].flat(Infinity).join('') === held);
  expect(held).toBe(
    statusEventText({ label: 'Royal Assent', date: '2026-08-26' }),
  );
  expect(event).toBeDefined();
  const eventStyle = StyleSheet.flatten(event!.props.style);
  expect(eventStyle.fontSize).toBe(heldStyle.fontSize);
  expect(eventStyle.lineHeight).toBe(heldStyle.lineHeight);
  expect(eventStyle.fontFamily).toBe(heldStyle.fontFamily);
});

test('the likely event follows what the index row knows, and is absent where the header draws none', () => {
  const row = {
    status: 'passed',
    status_as_of: '2026-08-26',
    introduced: '2026-08-17',
  };
  expect(likelyStatusEvent(row, 'Passed')).toEqual({
    label: 'Royal Assent',
    date: '2026-08-26',
  });
  // A stopped bill's event reads as its pill does.
  expect(likelyStatusEvent({ ...row, status: 'lapsed' }, 'Voted down')).toEqual(
    { label: 'Voted down', date: '2026-08-26' },
  );
  // Still before parliament on the day it was introduced: the meta line
  // carries that date and the header draws no event.
  expect(
    likelyStatusEvent(
      {
        status: 'before_parliament',
        status_as_of: '2026-08-17',
        introduced: '2026-08-17',
      },
      'Before parliament',
    ),
  ).toBeNull();
  expect(
    likelyStatusEvent(
      {
        status: 'before_parliament',
        status_as_of: '2026-09-01',
        introduced: '2026-08-17',
      },
      'Before parliament',
    ),
  ).toEqual({ label: 'Status as at', date: '2026-09-01' });
  expect(
    likelyStatusEvent({ ...row, status_as_of: null }, 'Passed'),
  ).toBeNull();
});

test("a private member's sponsor is a person row from the first frame, and stays that row when the file lands", async () => {
  const { arrive } = await open('au-federal-s1479');
  const seed = host('bill-seed')[0]!;
  // The directory is asked for at once, not after the bill's file.
  expect(runtime.directory).toHaveBeenCalledTimes(1);
  const seeded = seed.findAllByType(PersonRow);
  expect(seeded).toHaveLength(1);
  expect(host('bill-sponsor', seed)).toHaveLength(1);
  const before = {
    name: seeded[0]!.props.name,
    party: seeded[0]!.props.party,
    detail: seeded[0]!.props.detail,
    words: words(host('bill-sponsor', seed)[0]!),
  };
  expect(before.name).toBe('Mehreen Faruqi');
  expect(before.party).toBe('Greens');
  expect(before.detail).toBe('Sponsor');
  await arrive();
  expect(host('bill-seed')).toHaveLength(0);
  const loaded = tree!.root.findAllByType(PersonRow);
  expect(loaded).toHaveLength(1);
  expect({
    name: loaded[0]!.props.name,
    party: loaded[0]!.props.party,
    detail: loaded[0]!.props.detail,
    words: words(host('bill-sponsor')[0]!),
  }).toEqual(before);
});

test('a government bill still seeds its portfolio line and asks for no directory', async () => {
  await open('au-federal-r7534');
  const seed = host('bill-seed')[0]!;
  expect(host('bill-portfolio', seed)).toHaveLength(1);
  expect(seed.findAllByType(PersonRow)).toHaveLength(0);
  expect(runtime.directory).not.toHaveBeenCalled();
});
