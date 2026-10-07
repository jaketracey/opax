import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Disclosure } from '../src/design/primitives';
import { Excerpt } from '../src/features/search/Excerpt';

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
