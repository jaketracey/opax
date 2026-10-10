import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiClient } from '../src/api/client';
import { CatalogCache } from '../src/api/cache';
import { assertAllowedPath } from '../src/api/policy';
import { canonicalUrl } from '../src/navigation/external';
import { fromWebPath } from '../src/navigation/routes';
import {
  decodeBallot,
  decodeYear,
  changePreference,
  validPreferences,
  ballotPlan,
  wordsPanel,
  pairings,
  yearOpening,
} from '../src/features/explore/model';
import {
  decodeQuizRecord,
  grade,
  rankFor,
  type Question,
} from '../src/features/explore/quiz-model';
import { ExploreRepository } from '../src/features/explore/repository';
import { quizRecordPath } from '../src/features/explore/quiz-links';
import {
  decodeIndustryMoney,
  decodeMatrix,
} from '../src/features/reports/model';
import rounds from '../src/features/explore/quiz-rounds.json';
import { pinnedBytes } from './pinned';
import { reportsFixture } from '../scripts/reports-fixture';
const read = (path: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, '../../portal/public/' + path), 'utf8'),
  );
const ballotRaw = read(
  'electorates/releases/b56417062ccc33cf/el_5d600e7f6dca5b72ae04d686.json',
);
test('quiz record links never open private donor profiles and search opens a native draft', () => {
  expect(quizRecordPath('/subject/donor/Jane%20Citizen')).toBeNull();
  expect(quizRecordPath('/subject/donor/Maurice%20Blackburn%20Pty%20Ltd')).toBe(
    '/subject/donor/Maurice%20Blackburn%20Pty%20Ltd',
  );
  const path = quizRecordPath(
    '/search?speaker=Glenn+Sterle&from=2025&to=2025',
  )!;
  expect(fromWebPath(path)?.pathname).toBe('/search');
});
test('ballot retains the exact 2025 draw and refuses unverified candidates, source, incomplete and duplicate preferences', () => {
  const ballot = decodeBallot(ballotRaw),
    original = ballotRaw.elections.find(
      (c: { election: { poll_date: string } }) =>
        c.election.poll_date === '2025-05-03',
    );
  expect(() => decodeBallot(ballotRaw, 'el_wrong_seat')).toThrow();
  expect(ballot.candidates.map((c) => c.name)).toEqual(
    [...original.candidates]
      .sort(
        (a: { ballot_position: number }, b: { ballot_position: number }) =>
          a.ballot_position - b.ballot_position,
      )
      .map((c: { name: string }) => c.name),
  );
  let order: string[] = [];
  for (const c of ballot.candidates)
    order = changePreference(order, ballot.candidates, 'add', c.candidate_id);
  expect(validPreferences(order, ballot.candidates, true)).toBe(true);
  expect(validPreferences([...order, order[0]!], ballot.candidates)).toBe(
    false,
  );
  expect(() => ballotPlan(ballot, order.slice(1))).toThrow();
  const moved = changePreference(order, ballot.candidates, 'up', order[1]!);
  expect(moved[0]).toBe(order[1]);
  expect(ballotPlan(ballot, moved)).toContain(
    'For practice only. This is not a current ballot or an official voting document.',
  );
  expect(ballotPlan(ballot, moved)).toContain(
    `2. ${ballot.candidates[0]!.name}`,
  );
  const broken = structuredClone(ballotRaw);
  broken.elections.find(
    (c: { election: { poll_date: string } }) =>
      c.election.poll_date === '2025-05-03',
  ).candidates[0].ballot_position = 99;
  expect(() => decodeBallot(broken)).toThrow();
  expect(() => decodeBallot({ ...ballotRaw, sources: {} })).toThrow();
});
test.each(Array.from({ length: 29 }, (_, i) => 1998 + i))(
  'year %i keeps exact brief and dated voices, rejects invalid dates',
  (year) => {
    const raw = read(`years/${year}.json`),
      data = decodeYear(raw);
    expect(data.brief.answer).toBe(raw.brief.answer);
    expect(data.voices.speakers).toEqual(raw.voices.speakers);
    const prose = yearOpening(data.brief.answer);
    expect(
      [prose.lead, ...prose.rest].join(' ').replace(/\s+/g, ' ').trim(),
    ).toBe(data.brief.answer.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim());
    expect(() => decodeYear(raw, year === 2026 ? 2025 : 2026)).toThrow();
    expect(() => decodeYear({ ...raw, generated_at: 'yesterday' })).toThrow();
  },
);
test('all quiz decks contain eight grounded questions and every correct answer follows web scoring', () => {
  for (const deck of Object.values(rounds.rounds))
    for (const round of deck) {
      expect(round).toHaveLength(8);
      for (const q of round as Question[]) {
        const answer =
          q.kind === 'order' || q.kind === 'year' || q.kind === 'slider'
            ? q.answer!
            : q.options!.findIndex((o) => o.correct);
        expect(grade(q, answer).correct).toBe(true);
        expect(grade(q, answer).base).toBe(100);
        expect(q.fact).toBeTruthy();
        expect(q.explanation).not.toMatch(
          /400 biggest donors|industry's biggest donors/,
        );
      }
    }
  expect(rankFor(8, 8).name).toBe('Speaker of the House');
  expect(
    decodeQuizRecord({
      version: 1,
      bestStreak: 8,
      lastCorrect: 8,
      lastPoints: 2600,
    }),
  ).not.toBeNull();
  expect(
    decodeQuizRecord({
      version: 1,
      bestStreak: -1,
      lastCorrect: 9,
      lastPoints: 0,
    }),
  ).toBeNull();
});
test.each([
  '/years/1998.json',
  '/years/2026.json',
  '/api/tide?scope=federal',
  '/api/tide?scope=all',
])('exact Explore route admitted: %s', (path) =>
  expect(() => assertAllowedPath(path)).not.toThrow(),
);
test.each([
  '/years/1997.json',
  '/years/2027.json',
  '/years/2025.json?q=x',
  '/years/../2025.json',
  '/api/tide?scope=state',
  '/api/tide?scope=all&scope=all',
  '/api/tide?scope=all&nocache=1',
])('other Explore route refused: %s', (path) =>
  expect(() => assertAllowedPath(path)).toThrow(),
);
test('paid tide has no launch, background or implicit read, one request per action and session reuse, explicit retry only', async () => {
  const body = reportsFixture(pinnedBytes)('/api/tide')!;
  const transport = jest.fn(
    async (url: string) =>
      new Response(
        JSON.stringify({
          ...JSON.parse(body.toString()),
          scope: new URL(url).searchParams.get('scope'),
        }),
        { status: 200 },
      ),
  );
  const client = new ApiClient({
    origin: 'http://127.0.0.1:8951',
    version: '1',
    build: '1',
    transport: transport as typeof fetch,
    cache: new CatalogCache({
      readIndex: async () => [],
      writeIndex: async () => {},
      read: async () => undefined,
      write: async () => {},
      remove: async () => {},
    }),
  });
  const repository = new ExploreRepository(client);
  expect(transport).not.toHaveBeenCalled();
  await expect(client.get('/api/tide?scope=federal', (v) => v)).rejects.toThrow(
    'explicit action',
  );
  expect(transport).not.toHaveBeenCalled();
  await Promise.all([repository.tide('federal'), repository.tide('federal')]);
  expect(transport).toHaveBeenCalledTimes(1);
  await repository.tide('federal');
  expect(transport).toHaveBeenCalledTimes(1);
  transport.mockResolvedValueOnce(new Response('{}', { status: 503 }));
  await expect(repository.tide('all')).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(2);
  await repository.tide('all');
  expect(transport).toHaveBeenCalledTimes(3);
  transport.mockResolvedValueOnce(
    new Response(body.toString(), { status: 200 }),
  );
  const wrongScopeClient = new ApiClient({
    origin: 'http://127.0.0.1:8951',
    version: '1',
    build: '1',
    transport: transport as typeof fetch,
    cache: new CatalogCache({
      readIndex: async () => [],
      writeIndex: async () => {},
      read: async () => undefined,
      write: async () => {},
      remove: async () => {},
    }),
  });
  await expect(
    new ExploreRepository(wrongScopeClient).tide('all'),
  ).rejects.toThrow();
});
test('words per dollar never merges Other into a party or mistakes unseparated speeches for zero', () => {
  const matrix = decodeMatrix(
      JSON.parse(reportsFixture(pinnedBytes)('/api/matrix')!.toString()),
    ),
    money = decodeIndustryMoney(read('graph/money.json'));
  for (const pair of pairings) {
    const panel = wordsPanel(pair, matrix, money);
    expect(panel.rows.some((r) => r.party === 'Other')).toBe(false);
    expect(panel.moneyTotal).toBe(panel.rows.reduce((n, r) => n + r.money, 0));
  }
});
test.each(['quiz', 'ballot', 'tm', 'tide', 'matrix', 'wd'])(
  'canonical and native Explore share destination: %s',
  (tool) => {
    const path = `/explore?game=${tool}`;
    expect(fromWebPath(path)).toEqual({
      pathname: '/explore/[tool]',
      params: { tool },
    });
    expect(canonicalUrl(path).endsWith(path)).toBe(true);
  },
);
