import { act, type ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import { PartyLabel } from '../src/design/people';
import { Text } from '../src/design/text';
import { RecordNameLink } from '../src/design/record';
import { Card } from '../src/design/card';
import {
  decodeElectorate,
  electorateFor,
  decodeRecentInterests,
  recentDeclarationsFor,
} from '../src/api/catalogs';
import { CitedRecordRow } from '../src/features/ask/AskRows';
import { decodeAnswer } from '../src/features/ask/model';
import { rosterProfiles } from '../src/features/ask/people';
import { MemberHeroRow } from '../src/features/your-mp/MemberHeroRow';
import { ElectorateCard } from '../src/features/your-mp/ElectorateCard';
import { DeclarationEntry } from '../src/features/today/DeclarationRow';
import { FeedRow } from '../src/features/declarations/FeedRow';
import { moneyRecordRoute } from '../src/navigation/routes/public-money';
import { ElectorateDirectoryRow } from '../src/features/directories/DirectoryRows';
import { YearVoices } from '../src/features/explore/YearVoices';
import { decodeYear } from '../src/features/explore/model';
import { docRoute, partyRoute, personRoute } from '../src/navigation/routes';
import { openSource } from '../src/navigation/external';
import {
  catalogs,
  index,
  manifest,
  people,
  pinned,
  roster,
  slugs,
} from './pinned';

jest.mock('expo-router', () => {
  const pass = ({ children }: { children: unknown }) => children;
  return {
    router: { push: jest.fn() },
    useSegments: () => [],
    Link: Object.assign(pass, {
      Trigger: pass,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
  };
});
jest.mock('../src/api/runtime', () => ({}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openSource: jest.fn(),
}));
jest.mock('../src/features/your-mp/useSetAsMyElectorate', () => ({
  useSetAsMyElectorate: () => ({ visible: false }),
}));
jest.mock('../src/features/your-mp/FaceStackRow', () => ({
  useFaceURIs: () => [],
}));
jest.mock('../src/features/follows/store', () => ({
  useFollows: () => [],
  loadFollows: jest.fn(async () => []),
  follow: jest.fn(),
  unfollow: jest.fn(),
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
const seat = index.electorates.find(
  (row) => row.name === 'Grayndler' && row.jurisdiction === 'federal',
)!;
const view = electorateFor(decodeElectorate(pinned(seat.detail_url)));
const trees: TestRenderer.ReactTestRenderer[] = [];
function draw(element: ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  trees.push(tree);
  return tree.root;
}
function tap(node: ReactTestInstance) {
  const stopPropagation = jest.fn();
  expect(node.props.accessibilityRole).toBe('link');
  expect(node.props.accessibilityLabel).toBeTruthy();
  act(() => node.props.onPress({ stopPropagation }));
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledTimes(1);
}
function partyLink(root: ReactTestInstance) {
  return root
    .findAllByType(PartyLabel)[0]!
    .findAllByType(Text)
    .find((node) => node.props.onPress)!;
}
afterEach(() => {
  act(() => trees.splice(0).forEach((tree) => tree.unmount()));
  jest.clearAllMocks();
});

test('Ask source speakers use the verified profile and do not select the source row', () => {
  const source = decodeAnswer({
    answer: 'Housing.',
    sources: [
      {
        resource: 'r1',
        title: 'Housing',
        href: 'https://opax.com.au/doc/speech-1205524',
        speaker: 'WILKIE, Andrew',
        party: 'IND',
        snippet: '',
      },
    ],
  }).sources[0]!;
  const select = jest.fn();
  const root = draw(
    <CitedRecordRow
      record={source}
      profiles={rosterProfiles(roster, slugs)}
      onPress={select}
      testID="source"
    />,
  );
  const speaker = root.find(
    (node) =>
      node.props.accessibilityRole === 'link' &&
      node.props.testID === 'source-speaker' &&
      typeof node.props.onPress === 'function',
  );
  tap(speaker);
  expect(select).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith(
    personRoute('andrew-wilkie', 'Andrew Wilkie'),
  );
});

test('Ask source parties route a raw party code without selecting the cited record', () => {
  const source = decodeAnswer({
    answer: 'Housing.',
    sources: [
      {
        resource: 'r1',
        title: 'Housing',
        slug: 'speech-1205524',
        party: 'ALP',
        speaker: 'Anthony Albanese',
        snippet: '',
      },
    ],
  }).sources[0]!;
  const select = jest.fn();
  const root = draw(<CitedRecordRow record={source} onPress={select} />);
  tap(partyLink(root));
  expect(select).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith(partyRoute('Labor'));
});

test('an unresolved Ask speaker stays plain while the record still opens', () => {
  const source = decodeAnswer({
    answer: 'Housing.',
    sources: [
      {
        resource: 'speech-1205524',
        title: 'Housing',
        speaker: 'Unidentified witness',
        snippet: '',
      },
    ],
  }).sources[0]!;
  const root = draw(<CitedRecordRow record={source} testID="source" />);
  const speaker = root
    .findAllByType(Text)
    .find((node) => node.props.testID === 'source-speaker')!;
  expect(speaker.props.onPress).toBeUndefined();
  const row = root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === 'source',
  )[0]!;
  act(() => row.props.onAccessibilityTap());
  expect(router.push).toHaveBeenCalledWith(
    docRoute('speech-1205524', 'Housing'),
  );
});

test('an Ask source with only an external href opens its published original', () => {
  const source = decodeAnswer({
    answer: 'The original.',
    sources: [
      {
        resource: 'r1',
        title: 'Hansard',
        href: 'https://www.aph.gov.au/Parliamentary_Business/Hansard',
        snippet: '',
      },
    ],
  }).sources[0]!;
  const root = draw(<CitedRecordRow record={source} testID="original" />);
  const row = root.findAll(
    (node) =>
      node.props.accessibilityRole === 'link' &&
      node.props.testID === 'original' &&
      typeof node.props.onPress === 'function',
  )[0]!;
  expect(row.props.accessibilityRole).toBe('link');
  act(() => row.props.onPress());
  expect(openSource).toHaveBeenCalledWith(source.href);
});

test('a hash-only Ask source cannot accidentally open the home page', () => {
  const source = decodeAnswer({
    answer: 'Source.',
    sources: [
      {
        resource: 'fe1234567890abcdef1234567890abcd',
        title: 'Unresolved record',
        snippet: '',
      },
    ],
  }).sources[0]!;
  const root = draw(<CitedRecordRow record={source} testID="unresolved" />);
  const row = root.findAll(
    (node) =>
      typeof node.type !== 'string' &&
      node.props.testID === 'unresolved' &&
      typeof node.props.onPress === 'function',
  )[0]!;
  act(() => row.props.onPress());
  expect(router.push).not.toHaveBeenCalled();
  expect(openSource).not.toHaveBeenCalled();
});

test('Your MP and Today hero party names open the party independently', () => {
  const root = draw(
    <MemberHeroRow
      name="Anthony Albanese"
      slug="anthony-albanese"
      party="Labor"
      tenure="Member since 1996"
      testID="hero"
    />,
  );
  tap(partyLink(root));
  expect(router.push).toHaveBeenCalledWith(partyRoute('Labor'));
});

test('electorate directory party names open the party instead of selecting the electorate', () => {
  const select = jest.fn();
  const root = draw(<ElectorateDirectoryRow item={seat} onSelect={select} />);
  tap(partyLink(root));
  expect(select).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith(partyRoute('Labor'));
});

test('Today declaration names open the known member; the party is drawn, with a VoiceOver action', () => {
  const entry = recentDeclarationsFor(
    decodeRecentInterests(pinned('/interests/recent.json')),
    300,
    catalogs,
  ).data![0]!;
  const root = draw(
    <DeclarationEntry
      item={{ ...entry, profileSlug: 'susan-mcdonald' }}
      index={0}
    />,
  );
  const name = root.findByType(RecordNameLink).findByType(Text);
  tap(name);
  expect(router.push).toHaveBeenCalledWith(
    personRoute('susan-mcdonald', entry.name),
  );
  jest.clearAllMocks();
  // One party style in this list (sweep 1, item 3): the party is not a
  // second sighted link inside the row. VoiceOver still opens it.
  expect(partyLink(root)).toBeUndefined();
  const row = root.find(
    (node) =>
      typeof node.type === 'string' &&
      node.props.testID === 'today-declaration-0',
  );
  act(() =>
    row.props.onAccessibilityAction({ nativeEvent: { actionName: 'party' } }),
  );
  expect(router.push).toHaveBeenCalledWith(
    partyRoute('Liberal National Party of Queensland'),
  );
});

test('a declaration donor match uses its published donor id without opening the source row', () => {
  const entry = recentDeclarationsFor(
    decodeRecentInterests(pinned('/interests/recent.json')),
    300,
    catalogs,
  ).data!.find((row) => row.ties?.some((tie) => tie.donor_id))!;
  const tie = entry.ties!.find((tie) => tie.donor_id)!;
  const root = draw(<FeedRow item={entry} index={0} />);
  const link = root
    .findAllByType(RecordNameLink)
    .find(
      (node) => node.props.accessibilityLabel === `Open ${tie.organisation}`,
    )!;
  tap(link.findByType(Text));
  expect(router.push).toHaveBeenCalledWith(
    moneyRecordRoute(
      { node: tie.donor_id!, jurisdiction: 'federal' },
      tie.organisation,
    ),
  );
});

test('a declaration match without a donor identity never invents a donor route', () => {
  const entry = recentDeclarationsFor(
    decodeRecentInterests(pinned('/interests/recent.json')),
    300,
    catalogs,
  ).data!.find((row) => row.ties?.some((tie) => !tie.donor_id))!;
  const root = draw(<FeedRow item={entry} index={0} />);
  const links = root.findAllByType(RecordNameLink);
  expect(links.length).toBeGreaterThan(0);
  expect(links.every((node) => !node.props.href)).toBe(true);
});

test('the electorate card winner uses the existing directory, with an accessible alternate action', () => {
  const root = draw(
    <ElectorateCard seat={seat} view={view} directory={directory} />,
  );
  const winner = root.findByType(RecordNameLink).findByType(Text);
  tap(winner);
  expect(router.push).toHaveBeenCalledWith(
    personRoute('anthony-albanese', 'Anthony Albanese'),
  );
  expect(root.findByType(Card).props.accessibilityActions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'winner',
        label: 'Open Anthony Albanese',
      }),
    ]),
  );
});

test('a winner without a verified directory link is plain, while its party still opens', () => {
  const root = draw(<ElectorateCard seat={seat} view={view} />);
  expect(root.findByType(RecordNameLink).props.href).toBeUndefined();
  tap(partyLink(root));
  expect(router.push).toHaveBeenCalledWith(partyRoute('Labor'));
});

test('Time Machine still links a named party when the speaker cannot be joined', () => {
  const year = decodeYear(
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../portal/public/years/2025.json'),
        'utf8',
      ),
    ),
    2025,
  );
  const voice = year.voices.speakers.find(
    (row) => row.party && row.speeches >= 2,
  )!;
  const root = draw(
    <YearVoices
      data={{ ...year, voices: { ...year.voices, speakers: [voice] } }}
      roster={null}
      meta={{ asOf: year.generated_at, savedAt: null }}
    />,
  );
  const party = root.findByType(PartyLabel);
  tap(partyLink(root));
  expect(router.push).toHaveBeenCalledWith(partyRoute(party.props.party));
});
