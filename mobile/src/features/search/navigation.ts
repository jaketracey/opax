import { router } from 'expo-router';
import { catalogs } from '../../api/runtime';
import { nameKey } from '../../api/ids';
import { personRoute } from '../../navigation/routes';
import { openOnWeb } from '../../navigation/external';

/** Resolve identity before the handoff; never treat catalog-N as a person ID. */
export async function openSearchPerson(slug: string) {
  const person = (await catalogs.person(slug)).data;
  if (person.canonicalPersonId)
    router.push(personRoute(person.canonicalPersonId));
  else await openOnWeb(`/subject/person/${person.slug}`, person.name);
}
export async function openSuggestedPerson(name: string) {
  const slugs = (await catalogs.slugs()).data.slugs;
  const candidates = Object.entries(slugs).filter(
    ([, n]) => nameKey(n) === nameKey(name),
  );
  if (candidates.length === 1) await openSearchPerson(candidates[0]![0]);
  else await openOnWeb(`/subject/person/${encodeURIComponent(name)}`, name);
}
