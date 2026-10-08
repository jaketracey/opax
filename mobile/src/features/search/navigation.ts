import { router } from 'expo-router';
import { catalogs } from '../../api/runtime';
import { nameKey } from '../../api/ids';
import { ApiError, PersonIdentityError } from '../../api/errors';
import { personRoute, fromWebPath, partyRoute } from '../../navigation/routes';
import { openOnWeb, openSource, webPageUrl } from '../../navigation/external';

/** Where a person resolves to: their native profile, or their web page. */
export type PersonDestination =
  | { route: ReturnType<typeof personRoute> }
  | { web: string; title: string };

/** All search documents use the shared resolver, so the records lane changes
 * their destination everywhere when its native reader lands. */
export async function openSearchPath(path: string, title: string) {
  const route = searchPathRoute(path);
  if (route) {
    router.push(route);
    return;
  }
  const url = webPageUrl(path);
  if (!url) throw new Error('This record link is unavailable.');
  await openSource(url, title);
}

/** The native route for a search document's path, or null (the web). */
export function searchPathRoute(path: string) {
  const route = fromWebPath(path);
  if (route) return route;
  const party = /^\/subject\/party\/([^/?#]+)$/.exec(path);
  if (party?.[1]) return partyRoute(decodeURIComponent(party[1]));
  return null;
}

/** Resolve identity before the handoff; never treat catalog-N as a person ID. */
export async function resolveSearchPerson(
  slug: string,
): Promise<PersonDestination> {
  const person = (await catalogs.person(slug)).data;
  return person.canonicalPersonId
    ? { route: personRoute(person.canonicalPersonId) }
    : { web: `/subject/person/${person.slug}`, title: person.name };
}
export async function resolveSuggestedPerson(
  name: string,
): Promise<PersonDestination> {
  const slugs = (await catalogs.slugs()).data.slugs;
  const candidates = Object.entries(slugs).filter(
    ([, n]) => nameKey(n) === nameKey(name),
  );
  if (candidates.length === 1) {
    try {
      return await resolveSearchPerson(candidates[0]![0]);
    } catch (error) {
      if (
        !(error instanceof PersonIdentityError) &&
        !(error instanceof ApiError && error.code === 'not-found')
      )
        throw error;
    }
  }
  return { web: `/subject/person/${encodeURIComponent(name)}`, title: name };
}

async function go(destination: PersonDestination) {
  if ('route' in destination) router.push(destination.route);
  else await openOnWeb(destination.web, destination.title);
}
export async function openSearchPerson(slug: string) {
  await go(await resolveSearchPerson(slug));
}
export async function openSuggestedPerson(name: string) {
  await go(await resolveSuggestedPerson(name));
}
