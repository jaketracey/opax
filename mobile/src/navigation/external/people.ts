import type { WebPathResolver } from './types';
import { partyRename } from '../../design/party';
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
        const name = decodeURIComponent(party[1]);
        return partyRoute(
          // A former name opens the party at its current name, as the web's
          // 301 does (/subject/party/liberal-democratic-party).
          partyRename(name)?.name ?? name,
          u.searchParams.get('section') === 'changes' ? 'changes' : undefined,
        );
      } catch {
        return null;
      }
    }
    // The web's old /party/ path survives only as a renamed party's 301
    // (/party/liberal-democratic-party); other /party/ paths are app routes.
    const oldParty = /^\/party\/([^/?#]+)\/?$/.exec(u.pathname);
    if (oldParty?.[1]) {
      try {
        const rename = partyRename(decodeURIComponent(oldParty[1]));
        if (rename) return partyRoute(rename.name);
      } catch {
        return null;
      }
    }
    if (/^\/expenses\/?$/.test(u.pathname)) return expenseGlossaryRoute();
    if (/^\/declared\/?$/.test(u.pathname))
      return {
        ...declarationsRoute,
        params: Object.fromEntries(u.searchParams),
      };
    return null;
  },
] satisfies WebPathResolver[];
