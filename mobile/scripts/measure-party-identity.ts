// Pinned, offline differential benchmark. Timings exclude file decode and UI.
import { performance } from 'node:perf_hooks';
import { joinPerson, personSlugForResult } from '../src/api/person-identity';
import { partyMembers, partyLabels } from '../src/api/party-page';
import {
  joinPerson as oldJoin,
  personSlugForResult as oldResult,
} from '../tests/reference/person-identity-before';
import { partyMembers as oldMembers } from '../tests/reference/party-page-before';
import {
  catalogs,
  manifest,
  people,
  pinned,
  roster,
  slugs,
} from '../tests/pinned';
import { decodeMoney } from '../src/api/catalog-decoders';
const snapshots = () =>
  [slugs, roster, people, manifest].map((v) => structuredClone(v)) as [
    typeof slugs,
    typeof roster,
    typeof people,
    typeof manifest,
  ];
const measure = (run: () => unknown) => {
  const start = performance.now();
  run();
  return +(performance.now() - start).toFixed(3);
};
const samples = (run: () => () => unknown) =>
  Array.from({ length: 4 }, () => measure(run()));
const joins = (
  join: typeof joinPerson,
  keys: string[],
  args: ReturnType<typeof snapshots>,
) => {
  for (const slug of keys) {
    try {
      join(slug, ...args);
    } catch {
      /* identity refusals are part of the workload */
    }
  }
};
const all = Object.keys(slugs.slugs);
const selected = [
  'anthony-albanese',
  'julia-gillard',
  'penny-wong',
  'madonna-jarrett',
];
const yourMPNames = people.people
  .filter((p) =>
    p.electorates.some(
      (s) =>
        s.current &&
        s.jurisdiction === 'federal' &&
        (s.name === 'Grayndler' ||
          (s.chamber === 'senate' && s.name === 'New South Wales')),
    ),
  )
  .flatMap((p) => [p.name, ...p.aliases]);
const yourMPSlugs = all.filter((slug) =>
  yourMPNames.includes(slugs.slugs[slug]!),
);
const yourMP = (join: typeof joinPerson) =>
  samples(() => {
    const args = snapshots();
    return () => joins(join, yourMPSlugs, args);
  });
const person = (join: typeof joinPerson) =>
  samples(() => {
    const args = snapshots();
    return () => joins(join, selected, args);
  });
const directory = (join: typeof joinPerson) =>
  samples(() => {
    const args = snapshots();
    return () => joins(join, all, args);
  });
const party = (members: typeof partyMembers) =>
  samples(() => {
    const [s, r, p, m] = snapshots();
    return () => members('Labor', r, p, s, m);
  });
const search = (resolve: typeof personSlugForResult) =>
  samples(() => {
    const [s, , p] = snapshots();
    const interests = structuredClone(catalogs.interestIndex!);
    const rows = selected.map((slug) => ({
      kind: 'interest',
      slug: 'catalog-1',
      title: s.slugs[slug]!,
      snippet: '',
      resource: 'interest',
      href: `/declared?person=${encodeURIComponent(s.slugs[slug]!)}`,
    }));
    return () => {
      for (const row of rows) resolve(row, s, interests, p);
    };
  });
const foldCalls = (members: typeof partyMembers) => {
  const [s, r, p, m] = snapshots();
  const original = String.prototype.toLocaleLowerCase;
  let calls = 0;
  const names = new Set<string>();
  // eslint-disable-next-line no-extend-native
  String.prototype.toLocaleLowerCase = function (...args) {
    calls++;
    names.add(String(this));
    return original.apply(this, args);
  };
  try {
    members('Labor', r, p, s, m);
  } finally {
    // eslint-disable-next-line no-extend-native
    String.prototype.toLocaleLowerCase = original;
  }
  return { calls, distinctStrings: names.size };
};
const results = {
  node: process.version,
  snapshots: {
    slugs: all.length,
    roster: roster.people.length,
    people: people.people.length,
    parties: partyLabels(
      roster,
      people,
      decodeMoney(pinned('/graph/money.json')),
    ).length,
  },
  localeFoldCalls: {
    before: foldCalls(oldMembers),
    after: foldCalls(partyMembers),
  },
  coldMs: {
    labor: { before: party(oldMembers), after: party(partyMembers) },
    yourMPGrayndlerAndNSWSenators: {
      before: yourMP(oldJoin),
      after: yourMP(joinPerson),
    },
    personFourProfiles: { before: person(oldJoin), after: person(joinPerson) },
    directoryJoinsPersonLeadsFollowsMarkers: {
      before: directory(oldJoin),
      after: directory(joinPerson),
    },
    searchFourInterestBridges: {
      before: search(oldResult),
      after: search(personSlugForResult),
    },
  },
  warmLaborMs: samples(
    () => () => partyMembers('Labor', roster, people, slugs, manifest),
  ),
};
console.log(JSON.stringify(results, null, 2));
if (Math.max(...results.coldMs.labor.after) >= 50) process.exitCode = 1;
