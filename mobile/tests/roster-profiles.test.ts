import * as c from '../src/api/catalogs';
import { buildPortraitIndex } from '../src/api/portrait-index';
import { rosterProfileResolver } from '../src/features/directories/roster-profiles';
import {
  representativeProfile,
  type Directory,
  type ElectorateView,
} from '../src/features/your-mp/model';
import {
  catalogs,
  index,
  manifest,
  people,
  roster,
  slugs,
  pinned,
} from './pinned';

type Person = ElectorateView['people'][string];
const result = <T>(data: T) => ({ data, stale: false, savedAt: 1, asOf: null });
const directory: Directory = {
  manifest: result(manifest),
  people: result(people),
  roster: result(roster),
  slugs: result(slugs),
  electorates: result(index),
};
const identity = (name: string, fields: Partial<Person> = {}): Person => ({
  person_id: c.personId(`person_${'1'.repeat(24)}`),
  name,
  aliases: [],
  sources: [],
  ...fields,
});
function fixture({
  persons = [],
  members = [],
  names = {},
}: {
  persons?: c.PeopleCatalog['people'];
  members?: c.Roster['people'];
  names?: Record<string, string>;
} = {}): Directory {
  return {
    ...directory,
    people: result({ ...people, people: persons }),
    roster: result({ ...roster, people: members }),
    slugs: result({ ...slugs, slugs: names }),
  };
}
const maribyrnong = index.electorates.find((s) => s.name === 'Maribyrnong')!;
const history = c.decodeElectorate(pinned(maribyrnong.detail_url));

test('the recorded Maribyrnong identities use the native display names and verified portrait identities', () => {
  const resolve = rosterProfileResolver(directory);
  const portraits = buildPortraitIndex({
    ...catalogs,
    photoPeople: catalogs.photoPeople!,
    photoCredits: catalogs.photoCredits!,
  });
  for (const [name, slug, id] of [
    ['William Richard Shorten', 'bill-shorten', '10580'],
    ['Robert Charles Grant Sercombe', 'bob-sercombe', '10571'],
  ]) {
    const person = Object.values(history.people).find((p) => p.name === name)!;
    const profile = resolve(person);
    expect(profile).toBe(c.joinPerson(slug!, slugs, roster, people, manifest));
    expect(profile?.rosterPersonId).toBe(id);
    expect(portraits.portraits.get(profile!.slug)?.key).toBe(id);
  }
  expect(
    resolve(
      Object.values(history.people).find(
        (p) => p.name === 'Alan Gordon Griffiths',
      ),
    ),
  ).toBeNull();
});

test('an explicit canonical ID uses the same profile as an election candidate', () => {
  const jo = Object.values(history.people).find(
    (p) => p.name === 'Jo Briskey',
  )!;
  expect(
    rosterProfileResolver(directory)({ ...jo, name: 'An older spelling' }),
  ).toBe(representativeProfile(jo.person_id, directory));
  expect(rosterProfileResolver(directory)(undefined, jo.person_id)).toBe(
    representativeProfile(jo.person_id, directory),
  );
});

test('an explicit roster ID resolves a legal name without a nickname substitution', () => {
  const person = identity('Alexandra Louise Citizen', {
    legacy_person_id: c.rosterId('12345'),
  });
  const d = fixture({
    members: [
      { name: 'Alex Citizen', pid: c.rosterId('12345'), party: 'Labor' },
    ],
    names: { 'alex-citizen': 'Alex Citizen' },
  });
  expect(rosterProfileResolver(d)(person)?.name).toBe('Alex Citizen');
});

test('a normalised alias in the people index resolves an otherwise unlinked history row', () => {
  const person = identity('  ELODIE O’NEILL  ');
  const d = fixture({
    persons: [
      {
        ...identity('Ellie Citizen', {
          person_id: c.personId(`person_${'2'.repeat(24)}`),
        }),
        aliases: ["Élodie O'Neill"],
        electorates: [],
      },
    ],
    names: { 'ellie-citizen': 'Ellie Citizen' },
  });
  expect(rosterProfileResolver(d)(person)?.slug).toBe('ellie-citizen');
});

test('a recorded roster full name resolves to its native display name', () => {
  const person = identity('ALEXANDRA LOUISE CITIZEN');
  const d = fixture({
    members: [
      { name: 'Alex Citizen', full: 'Alexandra Louise Citizen', party: null },
    ],
    names: { 'alex-citizen': 'Alex Citizen' },
  });
  expect(rosterProfileResolver(d)(person)?.slug).toBe('alex-citizen');
});

test('ambiguous normalised names, surname stubs and unrecorded nicknames stay unresolved', () => {
  const d = fixture({
    names: {
      'alex-one': 'Alex Citizen',
      'alex-two': 'Alex Citizen',
      citizen: 'Citizen',
      'bill-citizen': 'Bill Citizen',
    },
  });
  const resolve = rosterProfileResolver(d);
  expect(resolve(identity('Alex Citizen'))).toBeNull();
  expect(resolve(identity('Citizen'))).toBeNull();
  expect(resolve(identity('William Richard Citizen'))).toBeNull();
  expect(resolve(undefined)).toBeNull();
});

test('a shared alias in the people index cannot select the first person', () => {
  const d = fixture({
    persons: ['Alex Citizen', 'Alexandra Citizen'].map((name, i) => ({
      ...identity(name, {
        person_id: c.personId(`person_${String(i + 2).repeat(24)}`),
      }),
      aliases: ['Alex Louise Citizen'],
      electorates: [],
    })),
    names: {
      'alex-citizen': 'Alex Citizen',
      'alexandra-citizen': 'Alexandra Citizen',
    },
  });
  expect(rosterProfileResolver(d)(identity('Alex Louise Citizen'))).toBeNull();
});

test('reused roster IDs and conflicting canonical IDs cannot lend a profile', () => {
  const person = identity('Alexandra Louise Citizen', {
    legacy_person_id: c.rosterId('12345'),
  });
  const shared = fixture({
    members: ['Alex Citizen', 'Alexandra Citizen'].map((name) => ({
      name,
      pid: c.rosterId('12345'),
      party: null,
    })),
    names: {
      'alex-citizen': 'Alex Citizen',
      'alexandra-citizen': 'Alexandra Citizen',
    },
  });
  expect(rosterProfileResolver(shared)(person)).toBeNull();
  const conflict = fixture({
    persons: [
      {
        ...identity('Alex Citizen', {
          person_id: c.personId(`person_${'2'.repeat(24)}`),
          legacy_person_id: c.rosterId('12345'),
        }),
        electorates: [],
      },
    ],
    members: [{ name: 'Alex Citizen', pid: c.rosterId('12345'), party: null }],
    names: { 'alex-citizen': 'Alex Citizen' },
  });
  expect(rosterProfileResolver(conflict)(person)).toBeNull();
});

test('the temporary service bridges require both the reviewed ID and legal name', () => {
  const resolve = rosterProfileResolver(directory);
  const bill = Object.values(history.people).find(
    (p) => p.name === 'William Richard Shorten',
  )!;
  expect(resolve({ ...bill, name: 'William Richard Citizen' })).toBeNull();
  expect(resolve({ ...bill, person_id: identity('').person_id })).toBeNull();
});
