import { router } from 'expo-router';
import { catalogs } from '../../api/runtime';
import { nameKey } from '../../api/ids';
import { ApiError, PersonIdentityError } from '../../api/errors';
import { personSlugForResult } from '../../api/person-identity';
import { personRoute, fromWebPath, partyRoute } from '../../navigation/routes';
import { openOnWeb, openSource, webPageUrl } from '../../navigation/external';
import type { SearchRecord } from './decoders';
import { interestName } from './present';

export type InterestResult = Pick<
  SearchRecord,
  'kind' | 'title' | 'snippet'
> & {
  href?: string;
  slug?: string;
  resource?: string;
  speaker?: string;
  personSlug?: string;
  date?: string | null;
  dateLabel?: string | null;
  state?: string | null;
};

/** Use the register's identity bridge, then the same native identity as Search. */
export async function searchInterestRoute(row: InterestResult) {
  if (row.kind !== 'interest') return null;
  let slug = row.personSlug;
  if (!slug) {
    const [slugs, interests, manifest] = await Promise.all([
      catalogs.slugs(),
      catalogs.interestIndex(),
      catalogs.manifest(),
    ]);
    const people = await catalogs.people(manifest.data);
    if (people.data.meta.release_id !== manifest.data.release_id)
      throw new ApiError('invalid-data', 'The people records are out of step.');
    const personHref = /^\/(?:subject\/person\/|declared\?)/.test(
      row.href ?? '',
    );
    const href = personHref
      ? row.href!
      : `/subject/person/${encodeURIComponent(row.speaker || interestName(row.title))}`;
    slug = personSlugForResult(
      {
        kind: row.kind,
        title: row.title,
        snippet: row.snippet,
        href,
        slug: row.slug ?? '',
        resource: row.resource ?? '',
      },
      slugs.data,
      interests.data,
      people.data,
    );
  }
  if (!slug) return null;
  try {
    const destination = await resolveSearchPerson(slug);
    return 'route' in destination
      ? personRoute(destination.route.params.slug, undefined, 'interests')
      : null;
  } catch (error) {
    if (
      error instanceof PersonIdentityError ||
      (error instanceof ApiError && error.code === 'not-found')
    )
      return null;
    throw error;
  }
}

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
