// TestFlight build 32 (10 Oct, ANGYQm3w): Bill Shorten "is marked as Labor
// but Labor records do not show here". Former members outside the dated
// electorate release had every block marked unlinked; their votes, party
// receipts, pay and expenses are held by roster ID and full name.
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import * as c from '../src/api/catalogs';
import Person from '../src/features/Person';
import { hasParliamentaryMembership } from '../src/features/your-mp/model';
import { RecordBlock } from '../src/features/your-mp/Evidence';
import { SourceLine, Text } from '../src/design/primitives';
import { catalogs, index, manifest, people, roster, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn() },
  catalogs: {
    person: jest.fn(),
    profileFor: jest.fn(),
    rosterProfileFor: jest.fn(),
    directory: jest.fn(),
  },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
const mockParams: { slug?: string } = {};
jest.mock('expo-router', () => ({
  useSegments: () => [],
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
const text = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .flatMap((n) => n.props.children)
    .filter((v) => typeof v === 'string')
    .join(' ')
    .replace(/\s+/g, ' ');

/** Every directory person without a dated release ID, once each. */
function rosterOnlyProfiles() {
  const seen = new Map<string, c.PersonProfile>();
  for (const slug of Object.keys(slugs.slugs)) {
    let p: c.PersonProfile;
    try {
      p = c.joinPerson(slug, slugs, roster, people, manifest);
    } catch {
      continue;
    }
    if (p.canonicalPersonId || seen.has(p.slug)) continue;
    if (!hasParliamentaryMembership(p, directory as never)) continue;
    seen.set(p.slug, p);
  }
  return [...seen.values()];
}

test('Bill Shorten links his voting record and Labor party receipts', () => {
  const shorten = c.joinPerson('bill-shorten', slugs, roster, people, manifest);
  expect(shorten.canonicalPersonId).toBeUndefined();
  expect(shorten.party).toBe('Labor');
  const view = c.rosterProfileFor(shorten, catalogs);
  expect(view.blocks.votes.status).toBe('ready');
  expect(view.blocks.votes.data!.for.length).toBeGreaterThan(0);
  expect(view.blocks.partyReceipts.status).toBe('ready');
  expect(view.blocks.partyReceipts.data!.party).toBe('Labor');
});

test('every former member outside the release gets the records held for them', () => {
  const profiles = rosterOnlyProfiles();
  const views = profiles.map((p) => c.rosterProfileFor(p, catalogs));
  const linked = (key: keyof (typeof views)[number]['blocks']) =>
    views.filter((v) => v.blocks[key].status === 'ready' && v.blocks[key].data)
      .length;
  // Pinned release: 583 such profiles; 431 now link at least one record.
  expect(profiles.length).toBeGreaterThan(550);
  expect(linked('votes')).toBeGreaterThan(280);
  expect(
    views.filter((v) => v.blocks.partyReceipts.data?.party).length,
  ).toBeGreaterThan(220);
  // Nothing is an error to retry: a refused join reads as not linked.
  expect(
    views.flatMap((v) =>
      Object.values(v.blocks).filter((b) => b.status === 'error'),
    ),
  ).toEqual([]);
});

test('a roster ID belonging to a namesake never links their records', () => {
  // Patrick Conaghan's roster ID is Rex Patrick's voting record.
  const p = c.joinPerson('patrick-conaghan', slugs, roster, people, manifest);
  const view = c.rosterProfileFor(p, catalogs);
  expect(view.blocks.votes.status).toBe('unlinked');
  expect(view.blocks.votes.data).toBeNull();
  // Mark Latham sat in NSW as well: an ID-less pay row cannot be his.
  const latham = c.joinPerson('mark-latham', slugs, roster, people, manifest);
  expect(c.rosterProfileFor(latham, catalogs).blocks.pay.status).toBe(
    'unlinked',
  );
});

test("Shorten's page shows his votes and Labor's receipts, not an unlinked notice", async () => {
  mockParams.slug = 'bill-shorten';
  const shorten = c.joinPerson('bill-shorten', slugs, roster, people, manifest);
  const mock = runtime as jest.Mocked<typeof runtime>;
  mock.person.mockResolvedValue(result(shorten));
  mock.directory.mockResolvedValue(directory as never);
  mock.rosterProfileFor.mockResolvedValue(
    c.rosterProfileFor(shorten, catalogs),
  );
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Person />);
  });
  expect(mock.rosterProfileFor).toHaveBeenCalledWith(shorten);
  expect(text(r)).toContain('Bill Shorten');
  expect(text(r)).toContain('Labor party receipts');
  expect(text(r)).toContain('2,302 recorded divisions');
  for (const id of ['person-votes-unlinked', 'person-receipts-unlinked'])
    expect(r.root.findAll((n) => n.props.testID === id)).toHaveLength(0);
  await act(async () => r.unmount());
});

test('an empty undated block says so once, with no "Date not published" line', async () => {
  const empty = {
    status: 'missing' as const,
    data: null,
    asAt: null,
    sources: [{ label: 'AEC disclosure returns', url: 'https://example.org' }],
    stale: false,
    savedAt: null,
  };
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <RecordBlock
        title="Party receipts"
        id="probe"
        block={empty}
        missing="No party receipts are held for this party."
        retry={() => {}}
      >
        {() => null}
      </RecordBlock>,
    );
  });
  expect(text(r)).toContain('No party receipts are held for this party.');
  expect(r.root.findAllByType(SourceLine)).toHaveLength(0);
  // A dated empty block keeps its source line.
  await act(async () => {
    r.update(
      <RecordBlock
        title="Party receipts"
        id="probe"
        block={{ ...empty, asAt: '2026-10-01' }}
        missing="No party receipts are held for this party."
        retry={() => {}}
      >
        {() => null}
      </RecordBlock>,
    );
  });
  expect(r.root.findAllByType(SourceLine)).toHaveLength(1);
  await act(async () => r.unmount());
});
