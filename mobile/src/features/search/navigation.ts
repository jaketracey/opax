import { router } from 'expo-router';
import { catalogs } from '../../api/runtime';
import { nameKey } from '../../api/ids';
import { hasParliamentaryMembership } from '../your-mp/model';
import { ApiError, PersonIdentityError } from '../../api/errors';
import { personRoute, fromWebPath, partyRoute } from '../../navigation/routes';
import { openOnWeb, openSource, webPageUrl } from '../../navigation/external';

/** All search documents use the shared resolver, so the records lane changes
 * their destination everywhere when its native reader lands. */
export async function openSearchPath(path: string, title: string) {
  const route = fromWebPath(path);
  if (route) {
    router.push(route);
    return;
  }
  const party = /^\/subject\/party\/([^/?#]+)$/.exec(path);
  if (party?.[1]) {
    router.push(partyRoute(decodeURIComponent(party[1])));
    return;
  }
  const url = webPageUrl(path);
  if (!url) throw new Error('This record link is unavailable.');
  await openSource(url, title);
}

/** Resolve identity before the handoff; never treat catalog-N as a person ID. */
export async function openSearchPerson(slug: string) {
  const person = (await catalogs.person(slug)).data;
  if (person.canonicalPersonId)
    router.push(personRoute(person.canonicalPersonId));
  else if (hasParliamentaryMembership(person, await catalogs.directory()))
    router.push(personRoute(person.slug));
  else await openOnWeb(`/subject/person/${person.slug}`, person.name);
}
export async function openSuggestedPerson(name: string) {
  const slugs = (await catalogs.slugs()).data.slugs;
  const candidates = Object.entries(slugs).filter(
    ([, n]) => nameKey(n) === nameKey(name),
  );
  if (candidates.length === 1) {
    try {
      await openSearchPerson(candidates[0]![0]);
      return;
    } catch (error) {
      if (
        !(error instanceof PersonIdentityError) &&
        !(error instanceof ApiError && error.code === 'not-found')
      )
        throw error;
    }
  }
  await openOnWeb(`/subject/person/${encodeURIComponent(name)}`, name);
}
