import { strictEqual } from 'node:assert';
import { catalogs, roster } from '../tests/pinned';
import { nameKey } from '../src/api/ids';
import {
  buildPortraitIndex,
  samePortraitPerson,
} from '../src/api/portrait-index';
const index = buildPortraitIndex(
  catalogs as import('../src/api/portrait-index').PortraitCatalogs,
);
const byFace = new Map<string, string[]>();
for (const [slug, portrait] of index.portraits)
  byFace.set(portrait.key, [...(byFace.get(portrait.key) ?? []), slug]);
let unrelatedSharedFaces = 0;
for (const slugs of byFace.values())
  for (const a of slugs)
    for (const b of slugs)
      if (
        !samePortraitPerson(index.identities.get(a)!, index.identities.get(b)!)
      )
        unrelatedSharedFaces++;
strictEqual(unrelatedSharedFaces, 0, 'Unrelated identities share a face');
const rosterPortraits = roster.people.filter((row) =>
  [...index.portraits.keys()].some(
    (slug) => nameKey(catalogs.slugs.slugs[slug]!) === nameKey(row.name),
  ),
).length;
console.log(
  JSON.stringify(
    {
      rosterPeople: roster.people.length,
      rosterPeopleWithPortrait: rosterPortraits,
      directoryPortraits: index.portraits.size,
      distinctPortraitFiles: byFace.size,
      surnameOnlyKeysRefused: index.refusedSurnameKeys,
      initialsKeysRefused: index.refusedInitialKeys,
      identityRefusals: index.identityRefusals,
      conflictingFaceKeysRefused: index.conflictingKeysRefused,
      unrelatedSharedFaces,
    },
    null,
    2,
  ),
);
