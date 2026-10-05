import { joinPerson, type PersonProfile } from './person-identity';
import { nameKey } from './ids';
import type {
  Roster,
  Slugs,
  PeopleCatalog,
  Manifest,
  PhotoPeople,
  PhotoCredits,
} from './catalog-decoders';
import { portraitFor, fullPortraitName } from './selectors';
import { portraitFaceKey } from './portrait-byte-groups';
export type PortraitInfo = NonNullable<ReturnType<typeof portraitFor>>;
export interface PortraitCatalogs {
  roster: Roster;
  slugs: Slugs;
  people: PeopleCatalog;
  manifest: Manifest;
  photoPeople: PhotoPeople;
  photoCredits: PhotoCredits;
}
function identityNames(p: PersonProfile, c: PortraitCatalogs): string[] {
  const release = c.people.people.find(
    (r) => r.person_id === p.canonicalPersonId,
  );
  if (!fullPortraitName(p.name)) return [];
  return [
    p.name,
    release?.name ?? '',
    ...(release?.aliases ?? []),
    p.rosterRow?.name ?? '',
    p.rosterRow?.full ?? '',
  ].filter(fullPortraitName);
}
export function samePortraitPerson(
  a: PersonProfile,
  b: PersonProfile,
): boolean {
  if (a.canonicalPersonId && a.canonicalPersonId === b.canonicalPersonId)
    return true;
  if (
    (!a.canonicalPersonId || !b.canonicalPersonId) &&
    (!a.legacyPersonId ||
      !b.legacyPersonId ||
      a.legacyPersonId === b.legacyPersonId) &&
    nameKey(a.name) === nameKey(b.name)
  )
    return true;
  if (!a.legacyPersonId || a.legacyPersonId !== b.legacyPersonId) return false;
  const names = [a.rosterRow?.name ?? a.name, b.rosterRow?.name ?? b.name].map(
    nameKey,
  );
  const [left, right] = names.map((n) => n.split(' '));
  return (
    left!.at(-1) === right!.at(-1) &&
    (left![0]!.startsWith(right![0]!) || right![0]!.startsWith(left![0]!))
  );
}
/** One index for the entire directory, so two unrelated identities cannot share a face. */
function* portraitIndexSteps(c: PortraitCatalogs) {
  const identities = new Map<string, PersonProfile>();
  const candidates = new Map<string, PortraitInfo>();
  const owners = new Map<string, PersonProfile[]>();
  let identityRefusals = 0;
  let processed = 0;
  for (const slug of Object.keys(c.slugs.slugs)) {
    if (processed++ % 12 === 0) yield;
    try {
      const identity = joinPerson(
        slug,
        c.slugs,
        c.roster,
        c.people,
        c.manifest,
      );
      identities.set(slug, identity);
      // A short directory row may combine several people. Its linked ID cannot
      // establish whose speeches the row contains, even if that ID has a face.
      if (!fullPortraitName(identity.name)) continue;
      const portrait = portraitFor(
        identityNames(identity, c),
        c.photoPeople,
        c.photoCredits,
        identity.legacyPersonId,
      );
      if (!portrait) continue;
      candidates.set(slug, portrait);
      const face = portraitFaceKey(portrait.key);
      owners.set(face, [...(owners.get(face) ?? []), identity]);
    } catch {
      identityRefusals++;
    }
  }
  const conflicts = new Set(
    [...owners]
      .filter(([, group]) =>
        group.some((a) => group.some((b) => !samePortraitPerson(a, b))),
      )
      .map(([key]) => key),
  );
  const portraits = new Map(
    [...candidates].filter(([, p]) => !conflicts.has(portraitFaceKey(p.key))),
  );
  return {
    portraits,
    identities,
    identityRefusals,
    conflictingKeysRefused: new Set(
      [...candidates.values()]
        .filter((p) => conflicts.has(portraitFaceKey(p.key)))
        .map((p) => p.key),
    ).size,
    unrelatedSharedFaces: [...owners].filter(
      ([key, group]) =>
        !conflicts.has(key) &&
        group.some((a) => group.some((b) => !samePortraitPerson(a, b))),
    ).length,
  };
}

export function buildPortraitIndex(c: PortraitCatalogs) {
  const steps = portraitIndexSteps(c);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
/** Cold directory lookup must leave native input and navigation responsive. */
export async function buildPortraitIndexAsync(c: PortraitCatalogs) {
  const steps = portraitIndexSteps(c);
  let step = steps.next();
  while (!step.done) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    step = steps.next();
  }
  return step.value;
}
