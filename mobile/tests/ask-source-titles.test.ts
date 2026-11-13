import { sourceMenu, sourceRoute } from '../src/features/ask/AskRows';
import { citeText } from '../src/features/ask/cite';
import {
  decodeAnswer,
  decodeChat,
  type Source,
  type Turn,
} from '../src/features/ask/model';
import { answerCopyText } from '../src/features/ask/share-answer';
import {
  personName,
  sourceMeta,
  sourceStage,
  sourceTitle,
} from '../src/features/ask/source-present';
import { displayedRecordTitle } from '../src/features/people/model';
import {
  decodeDocument,
  decodeRecent,
  recentRecord,
  recordHeadline,
} from '../src/features/records/model';
import { citationsFor } from '../src/features/records/citations';
import { resultTitle } from '../src/features/search/present';
import { moneyDestination } from '../src/features/search/GroupResults';
import { speechSource } from '../src/features/search/speeches';
import { openSource } from '../src/navigation/external';
import { shareRecord } from '../src/navigation/share';

jest.mock('../src/api/runtime', () => ({}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openSource: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/navigation/share', () => ({
  trackShare: jest.fn(),
  shareRecord: jest.fn().mockResolvedValue(undefined),
}));

const source = (title: string): Source => ({
  resource: 'fixture-resource',
  title,
  slug: 'press-pmt-fixture-title',
  href: '/doc/press-pmt-fixture-title',
  url: 'https://example.test/speech',
  snippet: 'A passage already normalised by the server: &amp; stays literal.',
  cited: true,
  date: '2026-09-24',
  answerRanges: [],
});

test('the reported PM speech title reads with an apostrophe', () => {
  expect(
    sourceTitle(
      source(
        'Australia&#039;s place in the Indo-Pacific - 2026 Atlantic Council Global Citizen Awards - New York',
      ),
    ),
  ).toBe(
    "Australia's place in the Indo-Pacific - 2026 Atlantic Council Global Citizen Awards - New York",
  );
});

test.each([
  ['Australia&#039;s interests', "Australia's interests"],
  ['Australia&#8217;s interests', 'Australia’s interests'],
  ['Australia&#x2019;s interests', 'Australia’s interests'],
  ['Trade &amp; &quot;security&quot;', 'Trade & "security"'],
  ['Australia&apos;s &rsquo;interests&rsquo;', "Australia's ’interests’"],
  ['Meat &amp;amp; Livestock', 'Meat &amp; Livestock'],
  ['Literal &amp;#039; &amp;quot;', 'Literal &#039; &quot;'],
  ['Research &unknown; DR&VM;', 'Research &unknown; DR&VM;'],
  ["Australia's trade & security", "Australia's trade & security"],
])('raw record titles are decoded once: %s', (raw, expected) => {
  const s = source(raw);
  const recent = decodeRecent({ items: [{ slug: s.slug, title: raw }] })[0]!;
  const document = decodeDocument({
    slug: s.slug,
    title: raw,
    labels: {},
    text: '',
  });
  for (let render = 0; render < 2; render++) {
    expect(sourceTitle(s)).toBe(expected);
    expect(resultTitle({ title: raw })).toBe(expected);
    expect(recordHeadline(document)).toBe(expected);
    expect(recordHeadline(recentRecord(recent))).toBe(expected);
    expect(displayedRecordTitle({ slug: s.slug, title: raw })).toBe(expected);
    expect(displayedRecordTitle({ slug: s.slug, title_subject: raw })).toBe(
      expected,
    );
  }
  expect(s.title).toBe(raw);
  expect(document.title).toBe(raw);
  expect(recent.title).toBe(raw);
});

test('entity decoding precedes title, stage and roster-name formatting', () => {
  const s = {
    ...source(
      'SAM O&#039;NEILL &mdash; Australia&#039;s interests &mdash; 2026-09-24 - Second reading',
    ),
    speaker: 'SAM O&#039;NEILL',
  };
  expect(sourceTitle(s)).toBe("Australia's interests");
  expect(sourceStage(source('Example Bill 2026 &ndash; Second reading'))).toBe(
    'Second reading',
  );
  expect(sourceMeta(source('Example Bill 2026 &#8211; Second reading'))).toBe(
    'Record · Second reading · 24 Sep 2026',
  );
  expect(personName('O&#039;NEILL, SAM, MP')).toBe("Sam O'Neill");
});

test('restored Ask data retains raw titles and already normalised passages', () => {
  const s = source('Meat &amp;amp; Livestock');
  const result = decodeAnswer({
    answer: 'An answer.',
    sources: [s],
    citations: {},
  });
  const chat = decodeChat(
    JSON.parse(
      JSON.stringify({
        id: 'fixture-chat',
        created: 1,
        updated: 2,
        thread: [{ role: 'answer', text: result.answer, result }],
      }),
    ),
  )!;
  const restored = chat.thread[0]!.result!.sources[0]!;
  expect(restored.title).toBe(s.title);
  expect(sourceTitle(restored)).toBe('Meat &amp; Livestock');
  expect(restored.snippet).toBe(s.snippet);
});

test('a presented pane title keeps literal entities when the share bar formats it', () => {
  const s = source('Meat &amp;amp; Livestock');
  const title = sourceTitle(s);
  expect(recordHeadline({ slug: s.slug, title }, { titleDecoded: true })).toBe(
    'Meat &amp; Livestock',
  );
});

test('Ask route names, shares and long-press actions use the same decoded title', () => {
  const s = source('Australia&#039;s &amp;amp; interests');
  const title = "Australia's &amp; interests";
  expect(sourceRoute(s)).toMatchObject({ params: { name: title } });
  for (const item of sourceMenu(s)) {
    if ('onPress' in item && ['Share', 'Open original'].includes(item.title))
      item.onPress();
  }
  expect(shareRecord).toHaveBeenCalledWith({ path: s.href, title });
  // An Ask row's original says where it was opened from (analytics).
  expect(openSource).toHaveBeenCalledWith(s.url, title, 'inline');
  const turn: Turn = {
    role: 'answer',
    text: 'An answer.',
    result: { answer: 'An answer.', sources: [s], citations: {} },
  };
  expect(
    answerCopyText({ role: 'user', text: 'A question?' }, turn, null, 'UTC'),
  ).toContain(title);
});

test.each(['apa', 'bibtex', 'ris'] as const)(
  'copied %s citations decode titles once',
  (style) => {
    const s = source('Australia&#039;s &amp;amp; interests');
    expect(citeText(s, style, 'fixture', '2026-11-11')).toContain(
      "Australia's &amp; interests",
    );
    const doc = decodeDocument({
      slug: s.slug,
      title: s.title,
      labels: {},
      text: '',
    });
    expect(
      citationsFor(doc, {
        origin: 'https://example.test',
        corpusVersion: 'fixture',
        accessed: '2026-11-11',
      }).find((entry) => entry.id === style)?.text,
    ).toContain("Australia's &amp; interests");
  },
);

test('search source details and money record links decode raw titles once', () => {
  const row = {
    ...source('Australia&#039;s &amp;amp; interests'),
    kind: 'speech',
    source: 'Hansard',
  };
  const details = speechSource(
    { stale: false, asOf: null } as never,
    [row],
    'A rule',
  );
  expect(details.originals?.[0]?.record).toBe("Australia's &amp; interests");
  expect(
    moneyDestination({
      ...row,
      kind: 'contract',
      href: '/money/contract/fixture',
    }),
  ).toMatchObject({ params: { name: "Australia's &amp; interests" } });
});
