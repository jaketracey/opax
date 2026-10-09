import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Disclosure } from '../src/design/primitives';
import { Excerpt, isWorkerSnippet } from '../src/features/search/Excerpt';
import serverExcerpts from '../scripts/fixtures/search/server-excerpts.json';

test('the matching record can be read in full and collapsed without changing it', () => {
  const snippet = 'First source sentence. The complete second source sentence.';
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Excerpt snippet={snippet} />);
  });
  const text = () =>
    renderer.root.findAllByType(NativeText).map((node) => node.props.children);
  const press = (label: string) =>
    act(() => {
      const button = renderer.root.findByType(Disclosure);
      expect(button.props.label).toBe(label);
      button.props.onToggle(!button.props.open);
    });
  const state = () =>
    renderer.root.find(
      (n) =>
        typeof n.type !== 'string' && n.props.accessibilityRole === 'button',
    ).props;
  expect(state()).toMatchObject({
    accessibilityRole: 'button',
    accessibilityState: { expanded: false },
  });
  expect(text()).toContain('First source sentence.');
  expect(text()).not.toContain(snippet);
  press('Read matching record');
  expect(state().accessibilityState.expanded).toBe(true);
  expect(text()).toContain(snippet);
  press('Hide matching record');
  expect(state().accessibilityState.expanded).toBe(false);
  expect(text()).toContain('First source sentence.');
  expect(text()).not.toContain(snippet);
});

test('a single sentence remains fully readable without a disclosure', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Excerpt snippet="One complete sentence." />,
    );
  });
  expect(renderer.root.findByType(NativeText).props.children).toBe(
    'One complete sentence.',
  );
});

test('a Worker search row is drawn as sent; a catalog row is decoded once', () => {
  const draw = (snippet: string, resource?: string) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Excerpt snippet={snippet} resource={resource} />,
      );
    });
    return renderer.root.findByType(NativeText).props.children;
  };
  const worker = serverExcerpts.rows.find(
    (r) => r.id === 'search-opens-mid-paragraph-ends-on-colon',
  )!.excerpt;
  // speech-796901's resource id is not pinned; any 32-hex id is a Worker row.
  const rid = '0123456789abcdef0123456789abcdef';
  expect(draw(worker, rid)).toBe(worker);
  expect(draw('Meat &#38; Livestock', rid)).toBe('Meat &#38; Livestock');
  // Catalog rows carry resource '' and raw published text.
  expect(draw('Meat &amp; Livestock Australia', '')).toBe(
    'Meat & Livestock Australia',
  );
  expect(isWorkerSnippet('')).toBe(false);
  expect(isWorkerSnippet(rid)).toBe(true);
});
