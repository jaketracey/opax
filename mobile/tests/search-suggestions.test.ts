import { bills, catalogs, index, roster, slugs } from './pinned';
import { nameKey } from '../src/api/ids';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import {
  suggestionsFor,
  rosterIdentityFor,
  searchPersonFor,
} from '../src/api/catalogs';
import {
  groupSuggestions,
  searchKinds,
  personRowContext,
} from '../src/features/search/model';
import { joinPerson } from '../src/api/person-identity';
import { partyText } from '../src/design/party';

test('suggestion matching folds case and whitespace and preserves source names', () => {
  const expected = suggestionsFor('Albanese', roster, index, bills);
  expect(suggestionsFor('  ALBANESE  ', roster, index, bills)).toEqual(
    expected,
  );
  expect(expected.people.some((p) => p.name === 'Anthony Albanese')).toBe(true);
  expect(expected.electorates.some((s) => s.name === 'Grayndler')).toBe(true);
});
test.each(['', ' ', 'x'])(
  'under two characters does not suggest: %s',
  (query) => {
    expect(
      groupSuggestions(suggestionsFor(query, roster, index, bills)).every(
        (g) => g.rows.length === 0,
      ),
    ).toBe(true);
  },
);
test('grouping preserves catalog kind, source order and identity', () => {
  const suggestions = suggestionsFor('support', roster, index, bills);
  const groups = groupSuggestions(suggestions);
  expect(groups.map((g) => g.kind)).toEqual(['people', 'electorates', 'bills']);
  expect(groups[2]?.rows).toBe(suggestions.bills);
  expect(suggestions.bills.length).toBeGreaterThan(0);
  expect(
    suggestions.bills.every((b) => b.title.toLowerCase().includes('support')),
  ).toBe(true);
});
test('no-match query returns three empty groups and no fabricated record', () => {
  const groups = groupSuggestions(
    suggestionsFor('zzzznevermatchingcatalog', roster, index, bills),
  );
  expect(groups.map((g) => g.rows)).toEqual([[], [], []]);
});
test('the kind control exposes exactly the permitted catalog submissions', () => {
  expect(searchKinds.map((k) => k.value)).toEqual([
    'person',
    'interest',
    'pay',
    'expense',
  ]);
});

// All 13 twins in the pinned roster: case variants as well as apostrophes.
const twinNames = [
  'Hugh McDermott',
  "Brendan O'Connor",
  "Kelly O'Dwyer",
  "Ken O'Dowd",
  'Bert Van Manen',
  "Gavan O'Connor",
  'Scot MacDonald',
  'Jodi McKay',
  'M O’Brien',
  'D O’Brien',
  'D’Ambrosio',
  'Yvette D’Ath',
  "Deborah O'Neill",
];
test.each(twinNames)(
  'the two spellings of %s suggest one slug-holder row',
  (name) => {
    const key = nameKey(name);
    const twins = roster.people.filter((p) => nameKey(p.name) === key);
    expect(twins).toHaveLength(2);
    const holder = Object.values(slugs.slugs).find((n) => nameKey(n) === key);
    for (const twin of twins) {
      const rows = suggestionsFor(
        twin.name,
        roster,
        index,
        bills,
      ).people.filter((p) => nameKey(p.name) === key);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe(holder);
    }
  },
);

test.each([
  ['A.J. Example', 'Aj Example'],
  ['José Example', 'Jose Example'],
  ['Renée Example', 'Rene\u0301e Example'],
  ['Jean–Example', 'Jean Example'],
])(
  'unresolved punctuation and accent twins %s / %s are not suggested as members',
  (name, twin) => {
    const fuller = { ...roster.people[0]!, name, speeches: 10 };
    const sources = {
      ...roster,
      people: [{ ...fuller, name: twin, speeches: 1 }, fuller],
    };
    const verified = memberSuggestionRoster(sources, catalogs);
    for (const query of [name, twin])
      expect(suggestionsFor(query, verified, index, bills).people).toEqual([]);
  },
);

test('all pinned Search identities agree with the profile header', () => {
  let resolved = 0,
    conflicts = 0;
  expect(Object.keys(slugs.slugs)).toHaveLength(1548);
  for (const slug of Object.keys(slugs.slugs)) {
    let profile;
    try {
      profile = joinPerson(
        slug,
        slugs,
        roster,
        catalogs.people,
        catalogs.manifest,
      );
    } catch {
      conflicts++;
      expect(searchPersonFor(slug, catalogs)).toBeNull();
      continue;
    }
    const row = personRowContext(searchPersonFor(slug, catalogs));
    expect({
      slug,
      party: row.party,
      status: row.partyStatus,
      formerly: row.formerly,
    }).toEqual({
      slug,
      party: profile.party ?? undefined,
      status: profile.partyStatus,
      formerly: profile.formerly,
    });
    if (profile.party)
      expect(
        partyText({
          party: row.party!,
          status: row.partyStatus,
          formerly: row.formerly,
        }),
      ).toEqual(
        partyText({
          party: profile.party,
          status: profile.partyStatus,
          formerly: profile.formerly,
        }),
      );
    resolved++;
    const sourceRow = roster.people.find((p) => p.name === slugs.slugs[slug]);
    if (sourceRow)
      expect(rosterIdentityFor(sourceRow, catalogs)).toEqual(
        searchPersonFor(slug, catalogs),
      );
  }
  expect(resolved).toBe(1540);
  expect(conflicts).toBe(8);
});
test('unresolved Search rows have no party or place', () => {
  expect(personRowContext(null)).toMatchObject({
    party: undefined,
    place: undefined,
  });
});
test('surname stubs never borrow merged chambers, and committees never describe a place', () => {
  let stubs = 0;
  for (const row of roster.people) {
    const context = personRowContext(rosterIdentityFor(row, catalogs));
    expect(context.place ?? '').not.toContain('Senate committees');
    if (!row.name.trim().includes(' ') && !row.representation?.length) {
      stubs++;
      const identity = rosterIdentityFor(row, catalogs);
      if (!identity?.representation.length)
        expect(context.place).toBeUndefined();
    }
  }
  expect(stubs).toBeGreaterThan(200);
});
test('dated current seats replace former seats and senator places do not repeat their state', () => {
  const senator = personRowContext(
    searchPersonFor('david-shoebridge', catalogs),
  );
  expect(senator).toMatchObject({
    party: 'Greens',
    partyStatus: 'current',
    place: 'New South Wales · Senate',
  });
  const crewther = personRowContext(
    searchPersonFor('chris-crewther', catalogs),
  );
  expect(crewther.place).toContain('Mornington');
  expect(crewther.place).not.toContain('Dunkley');
});
test.each([
  ['Alex Greenwich', 'Sydney'],
  ['Jo Haylen', 'Summer Hill'],
  ['Mark Speakman', 'Cronulla'],
  ["Marjorie O'Neill", 'Coogee'],
  ['Yasmin Catley', 'Swansea'],
])('undated roster representation is neutral for %s', (name, seat) => {
  const slug = Object.entries(slugs.slugs).find(
    ([, value]) => nameKey(value) === nameKey(name),
  )![0];
  const identity = searchPersonFor(slug, catalogs)!;
  expect(identity.representation.length).toBeGreaterThan(0);
  expect(identity.representation.every((r) => r.current === undefined)).toBe(
    true,
  );
  expect(personRowContext(identity).place).toBe(
    `Recorded representation: ${seat} · New South Wales Legislative Assembly`,
  );
});
test('pinned representations are current or undated; undated seats use recorded wording', () => {
  let recorded = 0;
  for (const slug of Object.keys(slugs.slugs)) {
    const identity = searchPersonFor(slug, catalogs);
    expect(
      identity?.representation.some((r) => r.current === false) ?? false,
    ).toBe(false);
    if (
      identity?.representation.length &&
      identity.representation.every((r) => r.current === undefined)
    ) {
      recorded++;
      const place = personRowContext(identity).place;
      expect(place).toContain('Recorded representation:');
      expect(place).not.toContain('Former representation:');
    }
  }
  expect(recorded).toBeGreaterThan(600);
});
