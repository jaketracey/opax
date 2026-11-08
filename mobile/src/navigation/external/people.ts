import type { WebPathResolver } from './types';
import {
  directoryRoute,
  personRoute,
  personVotesRoute,
  personSpeechesRoute,
  personInterestsRoute,
  partyRoute,
  expenseGlossaryRoute,
  declarationsRoute,
} from '../routes/people';
export const peoplePaths = [
  (path) => {
    const u = new URL(path, 'https://opax.invalid');
    const directory = /^\/subject\/(person|party|electorate)\/?$/.exec(
      u.pathname,
    );
    if (directory?.[1])
      return directoryRoute(directory[1] as 'person' | 'party' | 'electorate');
    const person =
      /^\/subject\/person\/([a-z0-9-]+)(?:\/(votes|speeches|interests))?\/?$/.exec(
        u.pathname,
      );
    if (person?.[1]) {
      if (person[2] === 'votes') return personVotesRoute(person[1]);
      if (person[2] === 'speeches') return personSpeechesRoute(person[1]);
      if (person[2] === 'interests') return personInterestsRoute(person[1]);
      const section = u.searchParams.get('section');
      return personRoute(
        person[1],
        undefined,
        ['votes', 'interests', 'pay', 'changes'].includes(section ?? '')
          ? (section as 'votes' | 'interests' | 'pay' | 'changes')
          : undefined,
      );
    }
    const party = /^\/subject\/party\/([^/?#]+)\/?$/.exec(u.pathname);
    if (party?.[1]) {
      try {
        return partyRoute(
          decodeURIComponent(party[1]),
          u.searchParams.get('section') === 'changes' ? 'changes' : undefined,
        );
      } catch {
        return null;
      }
    }
    if (/^\/expenses\/?$/.test(u.pathname)) return expenseGlossaryRoute;
    if (/^\/declared\/?$/.test(u.pathname))
      return {
        ...declarationsRoute,
        params: Object.fromEntries(u.searchParams),
      };
    return null;
  },
] satisfies WebPathResolver[];
