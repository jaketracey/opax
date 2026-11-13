// Every party a quiz round links to opens a party page: the page resolves
// the link's name as catalogs.partyPage does, roster labels first and then
// with the money graph's parties, through resolveParty.
import { decodeMoney } from '../src/api/catalogs';
import { partyLabels, resolveParty } from '../src/api/party-page';
import frontPage from '../src/features/explore/quiz-front-page.json';
import { quizDestination } from '../src/features/explore/quiz-links';
import type { Question } from '../src/features/explore/quiz-model';
import rounds from '../src/features/explore/quiz-rounds.json';
import { fromWebPath } from '../src/navigation/routes';
import { people, pinned, roster } from './pinned';

const money = decodeMoney(pinned('/graph/money.json'));
const questions = [
  ...Object.values(rounds.rounds).flat(2),
  ...frontPage,
] as Question[];
const partyLinks = questions.filter((q) =>
  q.link.href.replace(/^#/, '').startsWith('/subject/party/'),
);

test('every quiz party link resolves to one recorded party', () => {
  expect(partyLinks).toHaveLength(34);
  const resolved = new Map<string, string | null>();
  for (const q of partyLinks) {
    const destination = quizDestination(q);
    expect(destination?.kind).toBe('original');
    if (destination?.kind !== 'original') continue;
    const route = destination.route() as {
      pathname: string;
      params: { slug: string; name: string };
    };
    expect(route.pathname).toBe('/party/[slug]');
    // The sheet opens the same page, with the same name.
    expect(fromWebPath(destination.original.url)).toEqual(route);
    const input = route.params.name;
    resolved.set(
      input,
      resolveParty(input, partyLabels(roster, people)) ??
        resolveParty(input, partyLabels(roster, people, money)),
    );
    expect(resolveParty(input, partyLabels(roster, people))).toBe(
      resolved.get(input),
    );
  }
  // Each name is itself a recorded label, found on the roster alone.
  expect(Object.fromEntries(resolved)).toEqual({
    Liberal: 'Liberal',
    'Country Liberal Party': 'Country Liberal Party',
    'One Nation': 'One Nation',
    LNP: 'LNP',
    Nationals: 'Nationals',
    Greens: 'Greens',
    'Family First': 'Family First',
    "Katter's Australian Party": "Katter's Australian Party",
  });
});
