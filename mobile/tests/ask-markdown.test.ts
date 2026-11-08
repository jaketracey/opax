import {
  answerBlocks,
  citeLabel,
  citedAnswer,
  parseAnswer,
  plainText,
  type Block,
  type Inline,
} from '../src/features/ask/answer-markdown';
import type { Answer, Source } from '../src/features/ask/model';

const source = (resource: string, ranges: [number, number][]): Source => ({
  resource,
  title: resource,
  slug: resource,
  href: `/doc/${resource}`,
  snippet: '',
  cited: true,
  answerRanges: ranges,
});
const words = (spans: Inline[]) =>
  spans.map((s) => (s.kind === 'cite' ? `(${s.label})` : s.text)).join('');
const drawn = (blocks: Block[]): string =>
  blocks
    .map((b) =>
      b.kind === 'bullets' || b.kind === 'numbered'
        ? b.items.map(words).join('\n')
        : b.kind === 'table'
          ? [b.header, ...b.rows].map((r) => r.map(words).join(' ')).join('\n')
          : words(b.spans),
    )
    .join('\n');

test('paragraphs, headings as strong blocks, bold, quotes and links in sentences', () => {
  const blocks = parseAnswer(
    '# Overview\n\nThe bill **sets a levy** on [licensed providers](https://opax.com.au/bill/x) today.\n\n> A quoted line',
  );
  expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'quote']);
  const para = blocks[1] as Extract<Block, { kind: 'paragraph' }>;
  expect(para.spans.map((s) => s.kind)).toEqual([
    'text',
    'strong',
    'text',
    'link',
    'text',
  ]);
  expect(para.spans[3]).toMatchObject({
    text: 'licensed providers',
    href: 'https://opax.com.au/bill/x',
  });
  // A link to anything but https or an OPAX path is just its words.
  const unsafe = parseAnswer('Read [this](javascript:void0) now.');
  expect(drawn(unsafe)).toBe('Read this now.');
});

test('bullets keep wrapped lines in their item; numbered lists keep their start', () => {
  const blocks = parseAnswer(
    '- First point\n  continues here\n- Second\n\n3. Three\n4. Four',
  );
  expect(blocks[0]).toMatchObject({ kind: 'bullets' });
  expect(drawn([blocks[0]!])).toBe('First point continues here\nSecond');
  expect(blocks[1]).toMatchObject({ kind: 'numbered', start: 3 });
});

test('tables need a separator row and keep every cell', () => {
  const [table] = parseAnswer(
    '| Office | Pay |\n|---|---:|\n| Backbencher | $233,660 |\n| Minister | $400,000 |',
  ) as [Extract<Block, { kind: 'table' }>];
  expect(table.kind).toBe('table');
  expect(table.header.map(words)).toEqual(['Office', 'Pay']);
  expect(table.rows.map((r) => r.map(words))).toEqual([
    ['Backbencher', '$233,660'],
    ['Minister', '$400,000'],
  ]);
});

test('citation offsets are code points, after emoji too', () => {
  const answer: Answer = {
    answer: '🙂 Levy set. Next part.',
    citations: {},
    sources: [source('a', [[0, 11]]), source('b', [[12, 22]])],
  };
  expect(citedAnswer(answer)).toBe('🙂 Levy set. [1] Next part. [2]');
});

test('adjacent marks merge into one: "1, 2" and a run of three "1 to 3"', () => {
  expect(citeLabel([1])).toBe('1');
  expect(citeLabel([2, 1])).toBe('1, 2');
  expect(citeLabel([1, 2, 3])).toBe('1 to 3');
  expect(citeLabel([1, 3])).toBe('1, 3');
  const [p] = parseAnswer('A claim. [1] [2] Another. [1][2][3]') as [
    Extract<Block, { kind: 'paragraph' }>,
  ];
  const cites = p.spans.filter((s) => s.kind === 'cite');
  expect(cites).toEqual([
    { kind: 'cite', numbers: [1, 2], label: '1, 2', sentence: 0 },
    { kind: 'cite', numbers: [1, 2, 3], label: '1 to 3', sentence: 1 },
  ]);
});

test('a mark after a full stop belongs to the sentence before it', () => {
  const answer: Answer = {
    answer: 'The levy passed. It took effect later.',
    citations: {},
    sources: [source('a', [[0, 16]]), source('b', [[17, 38]])],
  };
  const [p] = answerBlocks(answer) as [Extract<Block, { kind: 'paragraph' }>];
  const bySentence = (n: number) =>
    words(p.spans.filter((s) => s.sentence === n));
  expect(bySentence(0)).toBe('The levy passed.(1)');
  expect(bySentence(1).trim()).toBe('It took effect later.(2)');
  // A mark inside the sentence, before its full stop, stays there too.
  const [q] = parseAnswer('First claim [1]. Second claim.') as [
    Extract<Block, { kind: 'paragraph' }>,
  ];
  expect(q.spans.find((s) => s.kind === 'cite')?.sentence).toBe(0);
  expect(words(q.spans.filter((s) => s.sentence === 1)).trim()).toBe(
    'Second claim.',
  );
});

test('plain text for Copy and reports', () => {
  const text = plainText(
    parseAnswer(
      'The bill **sets a levy** [1].\n\n- First [2]\n- Second\n\n| A | B |\n|---|---|\n| 1 | 2 |',
    ),
  );
  expect(text).toBe(
    'The bill sets a levy [1].\n\n- First [2]\n- Second\n\nA · B\n1 · 2',
  );
});

describe('streaming holds back unfinished Markdown', () => {
  const stream = (text: string) =>
    drawn(parseAnswer(text, { streaming: true }));
  test.each([
    ['an unclosed **', 'The bill **sets a le', 'The bill sets a le'],
    ['a lone * or _', 'It was *very _close', 'It was very close'],
    ['a half table row', 'Pay:\n\n| A | B |\n|---|---|\n| 1 | 2', 'Pay:\nA B'],
    ['a table header with no separator', 'Pay:\n\n| A | B |\n', 'Pay:'],
    ['a half link', 'See [the bill](https://opax.com.au/bi', 'See the bill'],
    ['a bullet marker with no text', 'Points:\n\n- One\n- ', 'Points:\nOne'],
    ['a trailing [', 'The levy passed [', 'The levy passed'],
    ['a trailing [12', 'The levy passed [12', 'The levy passed'],
    [
      'finished marks',
      'The levy passed. [1] Then [2]',
      'The levy passed. Then',
    ],
  ])('%s', (_name, input, output) => {
    expect(stream(input)).toBe(output);
  });
  test('no delta of a recorded answer shows * | [n] or a raw address', () => {
    const final =
      'The bill **sets a levy** on [providers](https://opax.com.au/bill/x) [1].\n\n| Office | Pay |\n|---|---|\n| Backbencher | $1 |\n\n- One [2]\n- Two\n';
    for (let end = 1; end <= final.length; end++) {
      const out = stream(final.slice(0, end));
      expect(out).not.toMatch(/[*|]|\[\d+\]|https?:/);
    }
  });
});
