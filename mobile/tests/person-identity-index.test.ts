import {
  joinPerson,
  personSlugForResult,
  namedRosterRow,
  rosterRowFor,
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
import { catalogs, manifest, people, pinned, roster, slugs } from './pinned';

// Compare whole outputs, including row order, dates, sources and counts. The
// oracle uses the original scans and guards, with no production indexes.
test.each(
  partyLabels(roster, people, decodeMoney(pinned('/graph/money.json'))),
)(
  '%s current and recorded lists equal the pre-index implementation',
  (label) => {
    expect(partyMembers(label, roster, people, slugs, manifest)).toEqual(
      membersBefore(label, roster, people, slugs, manifest),
    );
  },
);
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
