import type { Roster, Slugs } from '../../api/catalog-decoders';
import { nameKey } from '../../api/ids';
import { decodeEntities } from '../../api/passage-text';

export type SpeechSpeakerData = {
  speaker?: string | null;
  party?: string | null;
};

const profileNames = new WeakMap<Slugs, Map<string, string[]>>();
function speakerProfiles(slugs: Slugs, names: string[]) {
  let index = profileNames.get(slugs);
  if (!index) {
    index = new Map();
    for (const [slug, name] of Object.entries(slugs.slugs)) {
      const key = nameKey(name);
      index.set(key, [...(index.get(key) ?? []), slug]);
    }
    profileNames.set(slugs, index);
  }
  return [...new Set(names.flatMap((name) => index.get(nameKey(name)) ?? []))];
}

/** Resolve the recorded speaker without inventing a profile from their name. */
export function speechSpeaker(
  row: SpeechSpeakerData,
  roster: Roster | null,
  slugs: Slugs | null,
) {
  if (!row.speaker) return null;
  const name = decodeEntities(row.speaker);
  const matches = roster?.people.filter(
    (person) =>
      nameKey(person.name) === nameKey(name) ||
      (!!person.full && nameKey(person.full) === nameKey(name)),
  );
  const person = matches?.length === 1 ? matches[0] : undefined;
  const profiles =
    person && slugs
      ? speakerProfiles(slugs, [person.name, person.full ?? person.name])
      : [];
  return {
    name,
    party: row.party ?? null,
    slug: profiles.length === 1 ? profiles[0] : undefined,
  };
}
