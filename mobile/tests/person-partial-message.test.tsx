import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Catalogs, personId, profileFor } from '../src/api/catalogs';
import { isPartialCatalog } from '../src/api/validation';
import { RecordBlock } from '../src/features/your-mp/Evidence';
import { catalogs, pinned, replaceAt, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
beforeEach(() =>
  jest.spyOn(console, 'warn').mockImplementation(() => undefined),
);
afterEach(() => jest.restoreAllMocks());

// Mirror ApiClient's catalog-wide partial flag, as in the reviewer's repro.
const api = (overrides: Record<string, unknown>) =>
  new Catalogs({
    get: async <T,>(path: string, decoder: (value: unknown) => T) => {
      const data = decoder(
        path in overrides
          ? overrides[path]
          : path === '/api/person-slugs'
            ? slugs
            : pinned(path),
      );
      return {
        data,
        ...(isPartialCatalog(data) ? { partial: true } : {}),
        stale: false,
        savedAt: 1000,
        asOf: null,
      };
    },
  } as never);

// Find a real no-record person in the pinned export, as in the reviewer's test.
const noVotes = catalogs.people.people.find((person) => {
  try {
    return (
      profileFor(personId(person.person_id), catalogs).blocks.votes.status ===
      'missing'
    );
  } catch {
    return false;
  }
});
if (!noVotes)
  throw new Error('The pinned export needs a no-voting-record case.');

test.each([
  {
    name: `partial votes: no record (${noVotes.name})`,
    person: noVotes.name,
    kind: 'votes',
    hadRecord: false,
  },
  {
    name: 'partial votes: own row dropped (Janelle Saffin)',
    person: 'Janelle Saffin',
    kind: 'votes',
    hadRecord: true,
  },
  {
    name: 'partial interests: no record (Alan Tudge)',
    person: 'Alan Tudge',
    kind: 'interests',
    hadRecord: false,
  },
] as const)('$name', async ({ person: name, kind, hadRecord }) => {
  const person = catalogs.people.people.find((p) => p.name === name)!;
  expect(person).toBeDefined();
  const id = personId(person.person_id);
  const before = (await api({}).profileFor(id)).blocks[kind];
  expect(before.status).toBe(hadRecord ? 'ready' : 'missing');
  expect(before.data === null).toBe(!hadRecord);
  expect(before.partial).toBeFalsy();

  const path = kind === 'votes' ? '/votes.json' : '/interests/index.json';
  const bad = replaceAt(
    pinned(path),
    kind === 'votes' ? ['10555', 'ayes'] : ['people', '10007', 'total'],
    kind === 'votes' ? null : -1,
  );
  const after = (await api({ [path]: bad }).profileFor(id)).blocks[kind];
  expect(after).toMatchObject({
    status: 'missing',
    data: null,
    partial: true,
    stale: false,
  });

  const missing =
    kind === 'votes'
      ? 'No voting summary is held for this person in the release.'
      : 'No register file is held for this person in the covered registers.';
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <RecordBlock
        title={kind === 'votes' ? 'Voting' : 'Declared interests'}
        id={`person-${kind}`}
        block={after}
        missing={missing}
        retry={() => {}}
      >
        {() => null}
      </RecordBlock>,
    );
  });
  const words = renderer.root
    .findAllByType(NativeText)
    .map((n) => [n.props.children].flat(3).join(''))
    .join(' ');
  expect(words).toContain(
    'No readable record was found for this person. Some rows in the latest public export were unreadable.',
  );
  expect(words).not.toContain('This record could not be read');
  expect(words).not.toContain(missing);
  act(() => renderer.unmount());
});
