import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiClient } from '../src/api/client';
import { CatalogCache } from '../src/api/cache';
import { assertAllowedPath } from '../src/api/policy';
import { canonicalUrl } from '../src/navigation/external';
import { fromWebPath } from '../src/navigation/routes';
import {
  decodeYear,
  wordsPanel,
  pairings,
  yearOpening,
} from '../src/features/explore/model';
import {
  answerText,
  decodeQuizRecord,
  formatGuess,
  fromSlider,
  grade,
  guessError,
  parseGuess,
  plainQuestion,
  pointsLine,
  quizAmpersandNames,
  quizId,
  quizShareText,
  rangeLabels,
  rankFor,
  roundGuess,
  scoreAnswer,
  sliderStart,
  toSlider,
  type Question,
} from '../src/features/explore/quiz-model';
import {
  quizPublisher,
  quizSourceDetails,
  QUIZ_PUBLISHERS,
} from '../src/features/explore/quiz-source';
import { frontPageDeck, quizRounds } from '../src/features/explore/quiz/data';
import frontPage from '../src/features/explore/quiz-front-page.json';
import { ExploreRepository } from '../src/features/explore/repository';
import {
  quizDestination,
  quizRecordPath,
} from '../src/features/explore/quiz-links';
import {
  decodeIndustryMoney,
  decodeMatrix,
} from '../src/features/reports/model';
import rounds from '../src/features/explore/quiz-rounds.json';
import { pinned, pinnedBytes } from './pinned';
import { decodeMoneyGraph } from '../src/features/money/data';
import { reportsFixture } from '../scripts/reports-fixture';
const read = (path: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, '../../portal/public/' + path), 'utf8'),
  );
test('quiz record links open every donor, and search opens submitted results', () => {
  expect(quizRecordPath('/subject/donor/Jane%20Citizen')).toBe(
    '/subject/donor/Jane%20Citizen',
  );
  expect(quizRecordPath('/subject/donor/Maurice%20Blackburn%20Pty%20Ltd')).toBe(
    '/subject/donor/Maurice%20Blackburn%20Pty%20Ltd',
  );
  const path = quizRecordPath(
    '/search?speaker=Glenn+Sterle&from=2025&to=2025',
  )!;
  expect(fromWebPath(path)?.pathname).toBe('/results/[kind]');
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
test.each(['quiz', 'tm', 'tide', 'matrix', 'wd'])(
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

test.each(['/explore?game=ballot', '/explore/?game=ballot'])(
  'a retired tool link opens the Explore hub: %s',
  (path) => {
    expect(fromWebPath(path)).toEqual({ pathname: '/explore' });
    expect(canonicalUrl(path)).not.toContain('game=ballot');
  },
);
test.each(['/reports', '/reports/', '/report/housing'])(
  'an old reports link opens the Explore hub: %s',
  (path) => {
    expect(fromWebPath(path)).toEqual({ pathname: '/explore' });
  },
);
test.each(['/reports/housing', '/reports/housing/s/1'])(
  'a retired report has no native destination: %s',
  (path) => {
    expect(fromWebPath(path)).toBeNull();
  },
);

const engineQuestions = [
  ...Object.values(rounds.rounds).flat(2),
  ...frontPage,
] as Question[];
const shownQuestions = [
  ...Object.values(quizRounds).flat(2),
  ...frontPageDeck,
] as Question[];
const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : value && typeof value === 'object'
      ? Object.values(value).flatMap(strings)
      : [];
const byTemplate = (template: string) =>
  engineQuestions.find((q) => q.template === template)!;

test('grade strings have no full stop, and close enough takes a comma', () => {
  const slider = byTemplate('money-donor-figure');
  const answer = Number(slider.answer);
  expect(grade(slider, answer).grade).toBe('Exactly right');
  expect(grade(slider, answer * 1.12).grade).toBe('12% away, close enough');
  expect(grade(slider, answer * 1.4).grade).toBe('40% away');
  const year = byTemplate('money-party-peak-year');
  expect(grade(year, Number(year.answer)).grade).toBe('Right on the year');
  expect(grade(year, Number(year.answer) + 1).grade).toBe('Off by 1 year');
  expect(grade(year, Number(year.answer) - 2).grade).toBe('Off by 2 years');
  const order = byTemplate('words-year-order');
  expect(grade(order, order.answer!).grade).toBe('Correct order');
  expect(grade(order, [...(order.answer as string[])].reverse()).grade).toBe(
    'Not quite in order',
  );
  const choice = byTemplate('words-biggest-source');
  const right = choice.options!.findIndex((o) => o.correct);
  expect(grade(choice, right).grade).toBe('Correct');
  expect(grade(choice, (right + 1) % 3).grade).toBe('Not this time');
  for (const q of shownQuestions) {
    const result = grade(q, 0);
    expect(result.grade).not.toMatch(/[.\u2014]$|\u2014/);
  }
});

test('points say the streak only when it multiplies', () => {
  const choice = byTemplate('words-biggest-source');
  const right = choice.options!.findIndex((o) => o.correct);
  expect(pointsLine(scoreAnswer(choice, right, 0).response)).toBe(
    '+100 points',
  );
  expect(pointsLine(scoreAnswer(choice, right, 1).response)).toBe(
    '+200 points · streak ×2',
  );
  expect(pointsLine(scoreAnswer(choice, right, 9).response)).toBe(
    '+400 points · streak ×4',
  );
  const wrong = scoreAnswer(choice, (right + 1) % 3, 3);
  expect(pointsLine(wrong.response)).toBe('+0 points');
  expect(wrong.streak).toBe(0);
});

test('the slider maps a log range, starts at its geometric middle and rounds drags only', () => {
  const q = byTemplate('money-donor-figure');
  const min = q.min!,
    max = q.max!;
  expect(toSlider(q, min)).toBe(0);
  expect(toSlider(q, max)).toBeCloseTo(1, 10);
  expect(fromSlider(q, 0.5)).toBeCloseTo(Math.sqrt(min * max), 6);
  for (const t of [0, 0.1, 0.37, 0.5, 0.9, 1])
    expect(toSlider(q, fromSlider(q, t))).toBeCloseTo(t, 10);
  expect(roundGuess(q, 929_297)).toBe(930_000);
  expect(roundGuess(q, 1)).toBe(min);
  expect(sliderStart(q)).toBe(roundGuess(q, Math.sqrt(min * max)));
  const year = byTemplate('money-party-peak-year');
  expect(toSlider(year, 2013)).toBe(2013);
  expect(roundGuess(year, 2012.6)).toBe(2013);
  expect(sliderStart(year)).toBe(Math.round((year.min! + year.max!) / 2));
});

test('a typed guess is kept exactly: shown, stored and graded as typed', () => {
  const q = byTemplate('money-donor-figure');
  const typed = { value: 929_297, typed: true };
  expect(parseGuess('$929,297')).toBe(929_297);
  expect(parseGuess('nine')).toBeNull();
  expect(answerText(q, typed)).toBe('$929,297');
  expect(grade(q, typed).grade).toBe(
    Number(q.answer) === 929_297 ? 'Exactly right' : grade(q, 929_297).grade,
  );
  const dragged = { value: roundGuess(q, 929_297), typed: false };
  expect(answerText(q, dragged)).toBe('$930,000');
  expect(formatGuess(q, 930_000)).toBe('$930,000');
  expect(rangeLabels(q)).toEqual(['$22,000', '$1.7m']);
  expect(guessError(q, 1)).toBe('Enter a figure from $22,000 to $1,671,178.');
  expect(guessError(q, 929_297)).toBeNull();
  const year = byTemplate('money-party-peak-year');
  expect(formatGuess(year, 2013)).toBe('2013');
  expect(rangeLabels(year)).toEqual(['1998', '2024']);
  expect(guessError(year, 1990)).toBe('Enter a year from 1998 to 2024.');
  const count = byTemplate('words-topic-figure');
  expect(formatGuess(count, 24_000)).toBe('24,000 speeches');
});

test('the share text is one sentence with the score, and no prompt', () => {
  expect(quizShareText(640, 6)).toBe(
    'I scored 640 in The record quiz on OPAX: 6 of 8 right.',
  );
});

test('no question the quiz shows carries an em dash', () => {
  for (const q of shownQuestions)
    for (const text of strings(q)) expect(text).not.toContain('\u2014');
  expect(
    plainQuestion({
      ...byTemplate('words-record-true-false'),
      fact: 'False \u2014 691,104 are collected',
    }).fact,
  ).toBe('False, 691,104 are collected');
});

test('topic and industry names read "and" on screen; proper names keep "&"', () => {
  expect(quizAmpersandNames).toEqual(
    expect.arrayContaining([
      'climate & energy',
      'property & construction',
      'pharmacies & medicines',
      'farming & agriculture',
      'finance & banking',
      'pubs & clubs',
    ]),
  );
  const shownFields = (q: Question) => [
    q.prompt,
    q.fact,
    q.explanation,
    q.link.label,
    ...(q.options ?? []).map((option) => option.label),
    ...(Array.isArray(q.answer) ? q.answer : []),
    ...(q.comparison
      ? [
          q.comparison.shownLabel,
          q.comparison.shownDisplay,
          q.comparison.hiddenLabel,
          q.comparison.hiddenDisplay,
        ]
      : []),
  ];
  for (const q of shownQuestions)
    for (const text of shownFields(q)) {
      expect(text).not.toContain('\u2014');
      for (const name of quizAmpersandNames) {
        const [left, right] = name.split(' & ');
        expect(text.toLowerCase()).not.toMatch(
          new RegExp(`\\b${left}\\s*&\\s*${right}\\b`),
        );
      }
    }
  const pharmacies = shownQuestions.filter((q) =>
    q.prompt.startsWith('Put these pharmacies and medicines donors in order'),
  );
  expect(pharmacies.length).toBeGreaterThan(0);
  const labels = pharmacies.flatMap((q) => q.options!.map((o) => o.label));
  expect(labels.some((label) => label.includes('Merck Sharp & Dohme'))).toBe(
    true,
  );
  expect(labels.some((label) => label.includes('Johnson & Johnson'))).toBe(
    true,
  );
  // The pass changes names in words, never a link.
  const engineHrefs = engineQuestions.map((q) => q.link.href);
  for (const q of shownQuestions) expect(engineHrefs).toContain(q.link.href);
  expect(
    plainQuestion({
      ...byTemplate('words-record-true-false'),
      prompt: 'Who spoke more on Climate & Energy, or on pubs & clubs?',
      fact: 'JJ Richards & Sons Pty Ltd gave to the ALH&MW Union',
    }),
  ).toMatchObject({
    prompt: 'Who spoke more on Climate and Energy, or on pubs and clubs?',
    fact: 'JJ Richards & Sons Pty Ltd gave to the ALH&MW Union',
  });
});

test('after the pass, every order question grades its own answer as correct, and every choice has one right option', () => {
  for (const q of shownQuestions) {
    if (q.kind === 'order') {
      const answer = q.answer as string[];
      const labels = q.options!.map((option) => option.label);
      for (const label of answer) expect(labels).toContain(label);
      expect(grade(q, answer).correct).toBe(true);
    } else if (['mc', 'tf', 'portrait', 'higher-lower'].includes(q.kind)) {
      expect(q.options!.filter((option) => option.correct)).toHaveLength(1);
    }
  }
});

test('every question names who produced its fact, and Hansard never publishes a count or a brief', () => {
  const topicCounts = new Set([
    'words-topic-figure',
    'words-topic-higher-lower',
    'words-year-order',
    'words-peak-year',
    'words-portrait-topic',
  ]);
  for (const q of engineQuestions) {
    const publisher = quizPublisher(q);
    expect(QUIZ_PUBLISHERS).toContain(publisher);
    expect(publisher).not.toBe('Hansard');
    if (q.template === 'words-year-voice') expect(publisher).toBe('OPAX');
    else if (topicCounts.has(q.template)) expect(publisher).toBe('OPAX topics');
    else if (q.template === 'money-true-false')
      expect(publisher).toBe(
        q.source.startsWith('AEC') ? 'AEC annual returns' : 'OPAX',
      );
    else if (q.template.startsWith('money-'))
      expect(publisher).toBe('AEC annual returns');
    else expect(publisher).toBe('OPAX');
    const details = quizSourceDetails(q, rounds.generated);
    expect(details.asOf).toBe(rounds.generated);
    expect(details.citation).toBe(publisher);
    expect(details.notes!.join(' ')).not.toMatch(
      /corpus|manifest|export|retrieval|labelled/i,
    );
  }
  const brief = byTemplate('words-year-voice');
  expect(quizSourceDetails(brief, rounds.generated).notes!.join(' ')).toMatch(
    /Machine-written/,
  );
  // The fallback table, by template then source.
  const base = byTemplate('words-biggest-source');
  expect(quizPublisher({ ...base, publisher: 'ParlInfo' })).toBe('ParlInfo');
  expect(quizPublisher({ ...base, template: 'bill-stage' })).toBe('ParlInfo');
  expect(quizPublisher({ ...base, template: 'speech-date' })).toBe('Hansard');
  expect(quizPublisher({ ...base, template: 'photo-year' })).toBe(
    'Wikimedia Commons',
  );
  expect(
    quizPublisher({ ...base, template: 'new', source: 'AEC returns' }),
  ).toBe('AEC annual returns');
  expect(
    quizPublisher({
      ...base,
      template: 'new',
      source: "Parliamentary record via OPAX's year brief",
    }),
  ).toBe('OPAX');
});

test('every quiz link opens a native OPAX page, and Ask links only draft', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  const kinds = new Set<string>();
  for (const q of engineQuestions) {
    const destination = quizDestination(q, graph);
    expect(destination).not.toBeNull();
    if (!destination) continue;
    kinds.add(destination.kind);
    if (destination.kind === 'ask') {
      expect(destination.draft.question).toMatch(/\?$/);
      expect(destination.draft.speaker).toBeTruthy();
      expect(destination.label).toMatch(/^Ask about /);
      continue;
    }
    const { original } = destination;
    expect(original.url.startsWith('/')).toBe(true);
    const native = fromWebPath(original.url) as {
      pathname: string;
      params?: Record<string, string>;
    } | null;
    const route = destination.route() as {
      pathname: string;
      params?: Record<string, string>;
    };
    expect(native).not.toBeNull();
    expect(native!.pathname).toBe(route.pathname);
    // A donor's record opens by its graph id, from the sheet and the route.
    if (route.pathname === '/money-record') {
      const node = graph.nodes.find((n) => n.id === route.params?.node);
      expect(node?.kind).toBe('donor');
      expect(native!.params?.node).toBe(node!.id);
      expect(route.params).not.toHaveProperty('rid');
    }
  }
  expect([...kinds].sort()).toEqual(['ask', 'original']);
  const donor = quizDestination(byTemplate('money-donor-figure'), graph);
  expect(donor?.kind === 'original' && donor.route()).toEqual({
    pathname: '/money-record',
    params: {
      node: graph.nodes.find((n) => n.label === 'Anacta Strategies Pty Ltd')!
        .id,
      name: 'Anacta Strategies Pty Ltd',
    },
  });
  // No graph yet, or a name the graph doesn't hold: no row, not a dead link.
  expect(quizDestination(byTemplate('money-donor-figure'), null)).toBeNull();
  const industry = quizDestination(byTemplate('money-industry-magnitude'));
  expect(industry?.kind === 'original' && industry.route()).toMatchObject({
    pathname: '/money',
    params: { industry: expect.any(String) },
  });
  const methods = quizDestination(byTemplate('words-biggest-source'));
  expect(methods?.kind === 'original' && methods.original.label).toBe(
    'How OPAX is built',
  );
  expect(methods?.kind === 'original' && methods.route()).toEqual({
    pathname: '/account/methods',
  });
  const voice = quizDestination(byTemplate('words-year-voice'));
  expect(voice).toMatchObject({
    kind: 'ask',
    label: 'Ask about Glenn Sterle in 2025',
    draft: {
      question: 'What did Glenn Sterle say in parliament in 2025?',
      speaker: 'Glenn Sterle',
      from: '2025',
      to: '2025',
    },
  });
});

test('the front-page deck is the bundled quiz subset Today reads, each with a stable id', () => {
  const templates = new Set([
    'words-topic-higher-lower',
    'words-topic-figure',
    'words-year-order',
    'words-peak-year',
    'words-portrait-topic',
    'words-year-voice',
    'words-biggest-source',
    'words-record-true-false',
    'money-party-peak-year',
    'money-party-from-industry',
    'money-true-false',
  ]);
  const derived = new Map<string, Question & { id: string }>();
  for (const deck of ['mixed', 'money', 'words'] as const)
    for (const round of rounds.rounds[deck] as Question[][])
      for (const q of round)
        if (templates.has(q.template) && !derived.has(quizId(q)))
          derived.set(quizId(q), { id: quizId(q), ...q });
  expect(frontPage).toEqual(
    [...derived.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
  );
  const ids = frontPage.map((q) => q.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const q of frontPage as (Question & { id: string })[]) {
    expect(q.id).toBe(quizId({ template: q.template, prompt: q.prompt }));
    expect(q.template).not.toMatch(/donor|industry-(most|magnitude)/);
    const answer =
      q.kind === 'order' || q.kind === 'year' || q.kind === 'slider'
        ? q.answer!
        : q.options!.findIndex((o) => o.correct);
    expect(grade(q, answer).correct).toBe(true);
  }
  expect(quizId({ template: 'a', prompt: 'b' })).toMatch(/^q[0-9a-f]{8}$/);
});
