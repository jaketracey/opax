import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Disclosure } from '../src/design/primitives';
import {
  Excerpt,
  PASSAGE_MAX,
  highlightParts,
  isWorkerSnippet,
} from '../src/features/search/Excerpt';
import serverExcerpts from '../scripts/fixtures/search/server-excerpts.json';
import records from '../scripts/fixtures/search/records.json';

const draw = (props: Parameters<typeof Excerpt>[0]) => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Excerpt {...props} />);
  });
  return renderer;
};
// The words drawn, nested highlights included.
const drawn = (renderer: TestRenderer.ReactTestRenderer) => {
  const flat = (children: unknown): string =>
    Array.isArray(children)
      ? children.map(flat).join('')
      : typeof children === 'string'
        ? children
        : children && typeof children === 'object' && 'props' in children
          ? flat((children as { props: { children: unknown } }).props.children)
          : '';
  return flat(renderer.root.findAllByType(NativeText)[0]!.props.children);
};

test('a result draws its passage with no disclosure under it', () => {
  const snippet = 'First source sentence. The complete second source sentence.';
  const renderer = draw({ snippet });
  expect(renderer.root.findAllByType(Disclosure)).toHaveLength(0);
  expect(drawn(renderer)).toBe(snippet);
  expect(JSON.stringify(renderer.toJSON())).not.toMatch(/matching record/);
});

test('a long passage is cut on a whole word with an ellipsis', () => {
  const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
  const text = drawn(draw({ snippet: `${words}.` }));
  expect(text.length).toBeLessThanOrEqual(PASSAGE_MAX + 1);
  expect(text.endsWith('…')).toBe(true);
  // The last word before the ellipsis is a whole word from the source.
  const last = text.slice(0, -1).split(' ').at(-1)!;
  expect(words.split(' ')).toContain(last);
});

test('the searched words are marked at the start of a word, in any case', () => {
  expect(highlightParts('Housing and rehousing; housings.', 'housing')).toEqual(
    [
      { text: 'Housing', match: true },
      { text: ' and rehousing; ', match: false },
      { text: 'housings', match: true },
      { text: '.', match: false },
    ],
  );
  // Two-letter words are never marked; nothing to mark is one run.
  expect(highlightParts('The cost of living', 'of')).toEqual([
    { text: 'The cost of living', match: false },
  ]);
  // A quoted phrase is marked whole, and only the phrase.
  expect(
    highlightParts('Cost of living and the cost of fuel', '"cost of living"'),
  ).toEqual([
    { text: 'Cost of living', match: true },
    { text: ' and the cost of fuel', match: false },
  ]);
  const renderer = draw({
    snippet: 'Housing supply and housing affordability.',
    query: 'housing',
  });
  const marks = renderer.root
    .findAllByType(NativeText)
    .filter((n) => n.props.style?.backgroundColor);
  expect(marks.map((n) => n.props.children)).toEqual(['Housing', 'housing']);
  expect(drawn(renderer)).toBe('Housing supply and housing affordability.');
});

test('a Worker search row is drawn as sent; a catalog row is decoded once', () => {
  const worker = serverExcerpts.rows.find(
    (r) => r.id === 'search-opens-mid-paragraph-ends-on-colon',
  )!.excerpt;
  // speech-796901's resource id is not pinned; any 32-hex id is a Worker row.
  const rid = '0123456789abcdef0123456789abcdef';
  expect(drawn(draw({ snippet: worker, resource: rid }))).toBe(worker);
  expect(drawn(draw({ snippet: 'Meat &#38; Livestock', resource: rid }))).toBe(
    'Meat &#38; Livestock',
  );
  // Catalog rows carry resource '' and raw published text.
  expect(
    drawn(draw({ snippet: 'Meat &amp; Livestock Australia', resource: '' })),
  ).toBe('Meat & Livestock Australia');
  expect(isWorkerSnippet('')).toBe(false);
  expect(isWorkerSnippet(rid)).toBe(true);
});

// The 9 Oct capture's "theSafer" and "Housingmeasure" are in the pinned
// record itself (speech-828012, a Senate copy of the same words as
// speech-827329, which has the spaces). The app draws both exactly as the
// record has them: it never joins words, and never guesses a split.
test('the app neither joins nor splits words in a pinned passage', () => {
  const joined = records.find((r) => r.slug === 'speech-828012')!;
  const spaced = records.find((r) => r.slug === 'speech-827329')!;
  const draws = (r: typeof joined) =>
    drawn(draw({ snippet: r.snippet, resource: r.resource }));
  expect(draws(spaced)).toContain(
    'the Safer and More Affordable Housing measure',
  );
  expect(draws(joined)).toContain('theSafer and More Affordable Housingmeasure');
});
