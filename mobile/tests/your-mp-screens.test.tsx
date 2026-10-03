import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { Image, RefreshControl } from 'react-native';
import { catalogs as runtime } from '../src/api/runtime';
import * as c from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import {
  catalogs,
  index,
  manifest,
  people,
  roster,
  slugs,
  pinned,
} from './pinned';
import Person from '../src/features/Person';
import YourMP from '../src/features/YourMP';
import Electorate from '../src/features/Electorate';
import { PersonRow, PartyLabel, Text } from '../src/design/primitives';
import { loadChoice, saveChoice } from '../src/features/your-mp/choice-store';
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    person: jest.fn(),
    profileFor: jest.fn(),
    directory: jest.fn(),
    yourMP: jest.fn(),
    electorateFor: jest.fn(),
  },
}));
jest.mock('../src/features/your-mp/choice-store', () => ({
  loadChoice: jest.fn(),
  saveChoice: jest.fn(),
}));
jest.mock('../src/api/image-policy', () => ({
  remoteImageURI: (path: string) => `http://127.0.0.1:8912${path}`,
}));
const mockParams: { slug?: string; id?: string } = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const directory = {
  manifest: result(manifest),
  people: result(people),
  roster: result(roster),
  slugs: result(slugs),
  electorates: result(index),
};
const mock = runtime as jest.Mocked<typeof runtime>;
async function render(element: ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  return r;
}
const text = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .flatMap((n) => n.props.children)
    .filter((v) => typeof v === 'string')
    .join(' ')
    .replace(/\s+/g, ' ');
beforeEach(() => {
  jest.clearAllMocks();
  mockParams.slug = 'anthony-albanese';
  mockParams.id = index.electorates.find(
    (s) => s.name === 'Grayndler',
  )!.electorate_id;
  mock.directory.mockResolvedValue(directory);
});
test('profile failure in expenses preserves votes, pay and identity; official portrait stays blank', async () => {
  mockParams.slug = 'penny-wong';
  const person = c.joinPerson(
    'penny-wong',
    slugs,
    roster,
    people,
    manifest,
  );
  const p = c.profileFor(person.canonicalPersonId!, {
    ...catalogs,
    interest: c.decodeInterest(pinned('/interests/10678.json')),
  });
  p.blocks.expenses = {
    ...p.blocks.expenses,
    data: null,
    status: 'error',
    error: new ApiError('server', 'Unavailable'),
  };
  mock.person.mockResolvedValue(result(person));
  mock.profileFor.mockResolvedValue(p);
  const r = await render(<Person />);
  expect(text(r)).toContain('Penny Wong');
  expect(text(r)).toContain('These are entitlements set by instrument');
  expect(
    r.root.findAll((n) => n.props.testID === 'person-expenses-error').length,
  ).toBeGreaterThan(0);
  expect(r.root.findAllByType(Image)).toHaveLength(0);
  expect(text(r)).toContain('Portrait display permission needs review');
  expect(text(r)).toContain('Record date not published');
  expect(text(r)).toContain('Real estate');
  expect(text(r)).not.toContain('real_estate');
  await act(async () => r.unmount());
});
test('former roster identity never masquerades as a current affiliation', async () => {
  mockParams.slug = 'julia-gillard';
  mock.person.mockResolvedValue(
    result(c.joinPerson('julia-gillard', slugs, roster, people, manifest)),
  );
  const former = c.joinPerson('julia-gillard', slugs, roster, people, manifest);
  mock.profileFor.mockResolvedValue(
    c.profileFor(former.canonicalPersonId!, catalogs),
  );
  const r = await render(<Person />);
  expect(r.root.findByType(PartyLabel).props.current).toBe(false);
  expect(text(r)).toContain('Historical entitlements are listed below');
  await act(async () => r.unmount());
});
test('chooser saves identifiers only after an explicit seat selection', async () => {
  (loadChoice as jest.Mock).mockResolvedValue(null);
  (saveChoice as jest.Mock).mockResolvedValue(undefined);
  const seat = index.electorates.find((s) => s.name === 'Grayndler')!;
  mock.yourMP.mockResolvedValue(
    c.yourMPFor(seat.electorate_id, index, manifest),
  );
  mock.profileFor.mockResolvedValue(
    c.profileFor(seat.representatives[0]!.person_id, catalogs),
  );
  const r = await render(<YourMP />);
  await act(async () => {
    r.root
      .find(
        (n) =>
          n.props.testID === 'seat-search' &&
          typeof n.props.onChangeText === 'function',
      )
      .props.onChangeText('Albanese');
  });
  expect(saveChoice).not.toHaveBeenCalled();
  await act(async () => {
    r.root
      .find(
        (n) =>
          n.props.testID === `seat-choice-${seat.slug}` &&
          typeof n.props.onPress === 'function',
      )
      .props.onPress();
  });
  expect(saveChoice).toHaveBeenCalledWith({
    version: 1,
    seatId: seat.electorate_id,
    stateSeatIds: [],
  });
  expect(text(r)).toContain('verified roster of');
  expect(
    r.root
      .findAllByType(PersonRow)
      .some((n) => n.props.name === 'Anthony Albanese'),
  ).toBe(true);
  await act(async () => r.unmount());
});
test('refresh completes while no seat has been chosen', async () => {
  (loadChoice as jest.Mock).mockResolvedValue(null);
  const r = await render(<YourMP />);
  const control = () =>
    r.root.find((n) => n.props.testID === 'your-mp-screen').props
      .refreshControl as ReactElement<{
      refreshing: boolean;
      onRefresh: () => void;
    }>;
  expect(control().type).toBe(RefreshControl);
  await act(async () => control().props.onRefresh());
  expect(control().props.refreshing).toBe(false);
  expect(text(r)).toContain('Your choice is saved on this iPhone only');
  await act(async () => r.unmount());
});
test('electorate preserves Census vintage and renders candidates as plain public-record text', async () => {
  const seat = index.electorates.find((s) => s.name === 'Grayndler')!;
  mock.electorateFor.mockResolvedValue(
    result(c.electorateFor(c.decodeElectorate(pinned(seat.detail_url)))),
  );
  const r = await render(<Electorate />);
  expect(text(r)).toContain('2021 Census geography');
  expect(text(r)).toContain('As at 2021');
  expect(text(r)).not.toContain('1 January 2021');
  expect(text(r)).toContain('not been redistributed');
  expect(text(r)).toContain(
    'Election winners and present-day representation can differ',
  );
  await act(async () => {
    r.root
      .find(
        (n) =>
          n.props.testID === 'election-expand-0' &&
          typeof n.props.onPress === 'function',
      )
      .props.onPress();
  });
  expect(text(r)).toContain('Rodney Smith');
  expect(
    r.root
      .findAllByType(PersonRow)
      .some((n) => n.props.name === 'Rodney Smith'),
  ).toBe(false);
  await act(async () => r.unmount());
});

test('roster-only member shows limited coverage without fabricating figures', async () => {
  mockParams.slug = 'tony-abbott';
  mock.person.mockResolvedValue(
    result(c.joinPerson('tony-abbott', slugs, roster, people, manifest)),
  );
  const r = await render(<Person />);
  expect(text(r)).toContain('Only the public directory identity');
  expect(mock.profileFor).not.toHaveBeenCalled();
  expect(r.root.findByType(PartyLabel).props.current).toBe(false);
  await act(async () => r.unmount());
});
test('unverified private identity is refused before any name or profile blocks render', async () => {
  mockParams.slug = 'synthetic-witness';
  mock.person.mockResolvedValue(
    result({
      ...c.joinPerson('tony-abbott', slugs, roster, people, manifest),
      name: 'Synthetic witness',
      rosterPersonId: undefined,
    }),
  );
  const r = await render(<Person />);
  expect(text(r)).not.toContain('Synthetic witness');
  expect(mock.profileFor).not.toHaveBeenCalled();
  expect(
    r.root.findAll((n) => n.props.testID === 'person-error').length,
  ).toBeGreaterThan(0);
  await act(async () => r.unmount());
});

test('permitted portrait renders with its source-provided credit and licence', async () => {
  mockParams.slug = 'sheena-watt';
  const identity = c.joinPerson('sheena-watt', slugs, roster, people, manifest);
  mock.person.mockResolvedValue(result(identity));
  mock.profileFor.mockResolvedValue(
    c.profileFor(identity.canonicalPersonId!, catalogs),
  );
  const r = await render(<Person />);
  expect(r.root.findByType(Image).props.source.uri).toContain(
    '/photos/wd-Q100327610.webp',
  );
  expect(text(r)).toContain('Gabagool2005');
  expect(text(r)).toContain('CC0');
  await act(async () => r.unmount());
});

test('a crossed electorate detail is rejected before names or figures render', async () => {
  const other = index.electorates.find((s) => s.name === 'Brisbane')!;
  mock.electorateFor.mockResolvedValue(
    result(c.electorateFor(c.decodeElectorate(pinned(other.detail_url)))),
  );
  const r = await render(<Electorate />);
  expect(text(r)).not.toContain('Brisbane');
  expect(text(r)).toContain('does not match the selected seat');
  await act(async () => r.unmount());
});
