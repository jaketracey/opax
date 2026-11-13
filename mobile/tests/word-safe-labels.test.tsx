import { act } from 'react';
import { useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestRenderer } from 'react-test-renderer';
import { PopUpButton } from '../src/design/controls';
import { SectionHeader } from '../src/design/layout';
import { brokenWords, hostChildren, layoutRow, textWidth } from './row-layout';

/**
 * Labels never break inside a word (design/README.md). Build 61 on an iPhone
 * Duo drew "Conversation" / "s" beside "See all conversations" in Ask's
 * 300pt pane, and "Showin" / "g" beside Bills' "Before parliament" picker in
 * a 281pt list. These rows are laid out by a model of Yoga's row rules
 * (row-layout.ts) at those widths.
 */

beforeEach(() => {
  jest
    .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width: 669, height: 951, scale: 3, fontScale: 1 });
});
afterEach(() => jest.mocked(useWindowDimensions).mockRestore());

const trees: ReactTestRenderer[] = [];
afterEach(() => act(() => trees.splice(0).forEach((tree) => tree.unmount())));
function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  trees.push(tree);
  return hostChildren(tree.root)[0]!;
}

describe('a section heading with a link', () => {
  test.each([
    ['Conversations', 'See all conversations'],
    ['Declarations', 'See all'],
    ['Following', 'See all'],
    ['How parliament voted', 'See all'],
    ['Programs and places', 'See all programs and places'],
  ])('"%s" keeps whole words beside "%s" at 300pt', (title, label) => {
    const band = render(
      <SectionHeader
        title={title}
        action={{ label, accessibilityLabel: label, onPress: jest.fn() }}
      />,
    );
    const narrow = layoutRow(band, 300, {});
    expect(brokenWords(narrow)).toEqual([]);
    // With room, the link still sits on the heading's line.
    const wide = layoutRow(band, 600, {});
    expect(wide.lines).toBe(1);
    expect(brokenWords(wide)).toEqual([]);
  });
  test('the Ask pane case: the link moves under "Conversations"', () => {
    const band = render(
      <SectionHeader
        title="Conversations"
        action={{
          label: 'See all conversations',
          accessibilityLabel: 'See all conversations',
          onPress: jest.fn(),
        }}
      />,
    );
    const result = layoutRow(band, 300, {});
    expect(result.lines).toBe(2);
    expect(result.widths[0]).toBe(300);
  });
});

describe('a pop-up row', () => {
  const scopes = [
    { value: 'before', label: 'Before parliament' },
    { value: 'passed', label: 'Passed' },
    { value: 'all', label: 'All' },
  ] as const;
  // The native SwiftUI button's width: its value, then the indicator.
  const button = textWidth('Before parliament', 17) + 30;
  test.each([200, 241, 281])(
    '"Showing" keeps whole words beside its choice at %ipt',
    (width) => {
      const row = render(
        <PopUpButton
          row
          label="Showing"
          value="before"
          options={scopes}
          onChange={jest.fn()}
          testID="bills-scope"
        />,
      );
      expect(
        brokenWords(layoutRow(row, width, { 'bills-scope': button })),
      ).toEqual([]);
    },
  );
  test('with room, the choice stays on the label’s line', () => {
    const row = render(
      <PopUpButton
        row
        label="Showing"
        value="before"
        options={scopes}
        onChange={jest.fn()}
        testID="bills-scope"
      />,
    );
    expect(layoutRow(row, 400, { 'bills-scope': button }).lines).toBe(1);
  });
});
