import {
  joinPerson,
  personSlugForResult,
  namedRosterRow,
  rosterRowFor,
  personSlugForId,
} from '../src/api/person-identity';
import { partyLabels, partyMembers } from '../src/api/party-page';
import {
  joinPerson as before,
  personSlugForResult as resultBefore,
  namedRosterRow as namedBefore,
  rosterRowFor as rowBefore,
} from './reference/person-identity-before';
import { partyMembers as membersBefore } from './reference/party-page-before';
import { decodeMoney } from '../src/api/catalog-decoders';
import { profileFor, suggestionsFor } from '../src/api/selectors';
import {
  memberSearchResults,
  memberSearchRows,
  memberSlugFor,
  memberSuggestionRoster,
} from '../src/api/catalog-search';
import {
  bills,
  catalogs,
  index,
  manifest,
  people,
  pinned,
  roster,
  slugs,
} from './pinned';

// The oracle follows the unfiltered profile path; it never uses search guards.
const nativeProfiles = new Map<string, { slug: string; name: string }>();
const nativeSlugs = new Set<string>();
for (const slug of Object.keys(slugs.slugs)) {
  try {
    const id = joinPerson(
      slug,
      slugs,
      roster,
      people,
      manifest,
    ).canonicalPersonId;
    if (!id) continue;
    const canonical = personSlugForId(id, slugs, roster, people, manifest);
    profileFor(id, catalogs);
    nativeProfiles.set(id, { slug: canonical, name: slugs.slugs[canonical]! });
    nativeSlugs.add(slug);
  } catch {
    /* The real native profile path refuses this identity. */
  }
}
test.each(
  partyLabels(roster, people, decodeMoney(pinned('/graph/money.json'))),
)(
  '%s native lists retain unfiltered pre-index identities, order and provenance',
  (label) => {
    const original = membersBefore(label, roster, people, slugs, manifest);
    const current = original.current.filter((p) => nativeSlugs.has(p.slug));
    const recorded = original.recorded.filter((p) => nativeSlugs.has(p.slug));
    expect(partyMembers(label, roster, people, slugs, manifest)).toEqual({
      ...original,
      current,
      recorded,
      currentCount: current.length,
    });
  },
);
test('every identity reachable through native profile navigation stays searchable and suggestible', () => {
  expect(nativeProfiles.size).toBe(595);
  const sources = memberSuggestionRoster(roster, catalogs);
  expect(sources.people).toHaveLength(595);
  for (const [id, profile] of nativeProfiles) {
    const record = {
      kind: 'person',
      title: profile.name,
      href: `/subject/person/${profile.slug}`,
      slug: id,
      snippet: '',
      resource: '',
    };
    expect(memberSearchRows([record], catalogs)).toEqual([record]);
    const found = memberSearchResults([], catalogs, profile.name);
    expect(
      found.some((row) => memberSlugFor(row, catalogs) === profile.slug),
    ).toBe(true);
    const suggestions = suggestionsFor(
      profile.name,
      sources,
      index,
      bills,
    ).people;
    expect(suggestions.some((p) => p.name === profile.name)).toBe(true);
  }
}, 30000);
test.each([
  ["Deb O'Neill", "O'Neill", 'deb-oneill'],
  ['Chris Crewther', 'Chris Crewther', 'chris-crewther'],
  ['Darren Cheeseman', 'Cheeseman', 'darren-cheeseman'],
  ['Chris Gatenby', 'Gatenby', 'chris-gatenby'],
  ['Stephen Smith', 'Stephen Smith', 'stephen-smith'],
  ['Vanessa Bleyer', 'Vanessa Bleyer', 'vanessa-bleyer'],
  ['Maree Edwards', 'Maree Edwards', 'maree-edwards'],
  ['Julia Gillard', 'Julia Gillard', 'julia-gillard'],
  ['Penny Wong', 'Penny Wong', 'penny-wong'],
  ['Janelle Saffin', 'Janelle Saffin', 'janelle-saffin'],
])(
  '%s keeps its native search and suggestion path, including legacy hrefs',
  (name, href, slug) => {
    const record = {
      kind: 'person',
      title: name,
      href: '/subject/person/' + encodeURIComponent(href),
      slug: 'catalog-fixture',
      snippet: '',
      resource: '',
    };
    expect(memberSlugFor(record, catalogs)).toBe(
      personSlugForId(
        joinPerson(slug, slugs, roster, people, manifest).canonicalPersonId!,
        slugs,
        roster,
        people,
        manifest,
      ),
    );
    expect(memberSearchRows([record], catalogs)).toEqual([record]);
    const canonical = slugs.slugs[memberSlugFor(record, catalogs)!]!;
    const suggestions = memberSuggestionRoster(roster, catalogs);
    expect(
      suggestionsFor(name, suggestions, index, bills).people.some(
        (p) => p.name === canonical,
      ),
    ).toBe(true);
  },
);
test('Stephen Smith and the Stephen-Smith surname collision resolve as separate exact names', () => {
  const collision = {
    ...catalogs,
    roster: {
      ...roster,
      people: [
        ...roster.people,
        { name: 'Stephen-Smith', full: 'Rachel Stephen-Smith', party: null },
      ],
    },
  };
  const records = ['Stephen Smith', 'Rachel Stephen-Smith'].map((title, i) => ({
    kind: 'person',
    title,
    href: '/subject/person/' + encodeURIComponent(i ? 'Stephen-Smith' : title),
    slug: `catalog-${i}`,
    snippet: '',
    resource: '',
  }));
  expect(memberSearchRows(records, collision)).toEqual([records[0]]);
  expect(memberSlugFor(records[0]!, collision)).toBe('stephen-smith');
  expect(memberSlugFor(records[1]!, collision)).toBeUndefined();
});
function outcome(join: typeof joinPerson, slug: string) {
  try {
    return { profile: join(slug, slugs, roster, people, manifest) };
  } catch (e) {
    return { error: (e as Error).name, message: (e as Error).message };
  }
}
test('every pinned slug preserves identity, refusal and roster decisions', () => {
  for (const slug of Object.keys(slugs.slugs)) {
    expect(outcome(joinPerson, slug)).toEqual(outcome(before, slug));
    const name = slugs.slugs[slug]!;
    expect(namedRosterRow([name], roster)).toEqual(namedBefore([name], roster));
    const row = namedBefore([name], roster);
    const get = (fn: typeof rosterRowFor) => {
      try {
        return fn([name], roster, row?.pid);
      } catch (e) {
        return (e as Error).message;
      }
    };
    expect(get(rosterRowFor)).toEqual(get(rowBefore));
  }
});
test('Search and declaration identity bridges keep full-name and ID ambiguity decisions', () => {
  for (const name of Object.values(slugs.slugs)) {
    for (const kind of ['person', 'interest'] as const) {
      const row = {
        slug: 'catalog-1',
        kind,
        title: name,
        snippet: name,
        resource: 'person',
        href:
          kind === 'interest'
            ? `/declared?person=${encodeURIComponent(name)}`
            : `/subject/person/${encodeURIComponent(name)}`,
      };
      expect(
        personSlugForResult(row, slugs, catalogs.interestIndex!, people),
      ).toBe(resultBefore(row, slugs, catalogs.interestIndex!, people));
    }
  }
}, 30000);
test('joins reuse only the exact immutable snapshot; all four catalogs invalidate', () => {
  const args = [slugs, roster, people, manifest] as const;
  const original = joinPerson('anthony-albanese', ...args);
  expect(joinPerson('anthony-albanese', ...args)).toBe(original);
  for (const i of [0, 1, 2, 3]) {
    const refreshed = [...args] as [
      typeof slugs,
      typeof roster,
      typeof people,
      typeof manifest,
    ];
    refreshed[i] = structuredClone(args[i]) as never;
    const next = joinPerson('anthony-albanese', ...refreshed);
    expect(next).not.toBe(original);
    expect(next).toEqual(original);
    expect(joinPerson('anthony-albanese', ...refreshed)).toBe(next);
  }
  const noSources = { ...manifest, sources: [] };
  expect(
    joinPerson('anthony-albanese', slugs, roster, people, noSources).sources,
  ).toEqual([]);
  expect(original.sources.length).toBeGreaterThan(0);
});
