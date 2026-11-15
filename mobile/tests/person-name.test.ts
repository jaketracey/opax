// A person's name as people write it (design/person-name.ts): a surname
// the record gives in capitals is drawn in title case; nothing else changes.
import { personDisplayName } from '../src/design/person-name';
import { rosterName } from '../src/features/directories/ElectorateHistory';
import { loadProfile } from '../src/features/Person';
import { catalogs } from '../src/api/runtime';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    person: jest.fn(),
    directory: jest.fn(),
    profileFor: jest.fn(),
    rosterProfileFor: jest.fn(),
    peopleFirsts: jest.fn(async () => null),
  },
}));

test.each([
  ['LEO McLEAY', 'Leo McLeay'],
  ['Leo McLEAY', 'Leo McLeay'],
  ['Anne O’CONNOR', 'Anne O’Connor'],
  ["Anne O'CONNOR", "Anne O'Connor"],
  ['Kim SMITH-JONES', 'Kim Smith-Jones'],
  ['KIM SMITH-JONES', 'Kim Smith-Jones'],
  ['Ian MacDONALD', 'Ian MacDonald'],
  ['Mary-Anne SMITH', 'Mary-Anne Smith'],
  ['Kim NG', 'Kim Ng'],
  // A given name's initials of one or two letters stay in capitals.
  ['AJ SMITH', 'AJ Smith'],
  ['A J SMITH', 'A J Smith'],
  ['A.J. SMITH', 'A.J. Smith'],
  ['JO SMITH-JONES', 'JO Smith-Jones'],
  // Post-nominals stay as they are, and the surname is the word before.
  ['LEO McLEAY AO', 'Leo McLeay AO'],
  ['Kim SMITH AM MP', 'Kim Smith AM MP'],
  ['ANNE O’CONNOR, KC', 'Anne O’Connor, KC'],
  ['Jean D’ARCY', 'Jean D’Arcy'],
  ['Zoë BJÖRK', 'Zoë Björk'],
])('%s is drawn as %s', (name, drawn) => {
  expect(personDisplayName(name)).toBe(drawn);
});

test.each([
  'Leo McLeay',
  'Bill Shorten',
  'William Richard Shorten',
  'Anne O’Connor',
  'Kim Smith-Jones',
  'Ian MacDonald',
  'Ian Macdonald',
  'Jan van der Berg',
  'Mary Jo Fisher',
  // No surname in capitals: initials and single words are left alone.
  'JJ Smith',
  // A post-nominal is not a surname.
  'Smith AO',
  'Kim Smith AO',
  'Kim Smith OAM',
  'Kim Smith AC QC',
  'Kim Smith MP',
  'Kim Smith KC',
  'Kim Smith SC',
  'Kim Smith PSM',
  'Kim Smith CSC',
  'AB',
  'SMITH',
  'Cher',
  '',
])('%s is left as it is', (name) => {
  expect(personDisplayName(name)).toBe(name);
});

test('the electorate history rows use the same rule', () => {
  expect(rosterName).toBe(personDisplayName);
});

test('a profile loads with its name drawn as people write it; the record is not changed', async () => {
  const identity = {
    slug: 'leo-mcleay',
    name: 'LEO McLEAY',
    canonicalPersonId: 'person_0123456789abcdef01234567',
    partyStatus: 'former',
    seats: [],
  };
  const record = { data: identity, stale: false, savedAt: 1, asOf: null };
  const view = {
    slug: 'leo-mcleay',
    blocks: {
      identity: { status: 'ready', data: { ...identity }, stale: false },
    },
  };
  jest.mocked(catalogs.person).mockResolvedValue(record as never);
  jest.mocked(catalogs.directory).mockResolvedValue(null as never);
  jest.mocked(catalogs.profileFor).mockResolvedValue(view as never);
  const loaded = await loadProfile('leo-mcleay');
  // The heading, the bar title and the share text all read this.
  expect(loaded!.profile.blocks.identity.data!.name).toBe('Leo McLeay');
  // What was read is as it was published.
  expect(record.data.name).toBe('LEO McLEAY');
  expect(view.blocks.identity.data.name).toBe('LEO McLEAY');

  // A name already in mixed case is the same object, untouched.
  const mixed = {
    slug: 'bill-shorten',
    blocks: {
      identity: {
        status: 'ready',
        data: { ...identity, name: 'Bill Shorten' },
        stale: false,
      },
    },
  };
  jest.mocked(catalogs.profileFor).mockResolvedValue(mixed as never);
  const again = await loadProfile('bill-shorten');
  expect(again!.profile.blocks.identity.data).toBe(mixed.blocks.identity.data);
});
