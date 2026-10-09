import { act } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { ChoiceChips } from '../src/design/controls';
import { Text } from '../src/design/text';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Search results' Passages / Briefs chips (search/Results.tsx). On the web
// these broke mid-word; here each label is word-safe at accessibility sizes,
// on a full-width chip, and both chips draw the same fixed geometry.
const draw = (width: number, fontScale: number, value: string) => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width, height: 1000, scale: 3, fontScale });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ChoiceChips
        segments={[
          { value: 'passages', label: 'Passages', testID: 'records-passages' },
          { value: 'briefs', label: 'Briefs', testID: 'records-briefs' },
        ]}
        value={value}
        onChange={jest.fn()}
      />,
    );
  });
  const chips = ['records-passages', 'records-briefs'].map((id) =>
    renderer.root.find(
      (n) => n.props.testID === id && typeof n.props.style === 'function',
    ),
  );
  return chips.map((chip) => ({
    style: StyleSheet.flatten(chip.props.style({ pressed: false })),
    text: chip.findByType(Text).props,
  }));
};

test.each([
  ['iPhone AX5', 390, 3.571],
  ['iPad AX5', 1024, 3.571],
  ['iPad AX1', 744, 1.786],
])('%s: full-width, word-safe chips', (_, width, fontScale) => {
  for (const value of ['passages', 'briefs']) {
    const [passages, briefs] = draw(width, fontScale, value);
    for (const chip of [passages!, briefs!]) {
      expect(chip.text.wordSafe).toBe(true);
      expect(chip.text.numberOfLines).toBeUndefined();
      expect(chip.style).toMatchObject({ alignSelf: 'stretch', minHeight: 36 });
      expect(chip.style.height).toBeUndefined();
    }
    // Choosing a chip changes colours only, never size or text role.
    const { backgroundColor: _a, ...one } = passages!.style;
    const { backgroundColor: _b, ...other } = briefs!.style;
    expect(one).toEqual(other);
    expect(passages!.text.variant).toBe(briefs!.text.variant);
  }
});

test.each([
  ['iPhone', 390],
  ['iPad', 1024],
])('%s at standard sizes: single-word hugging chips', (_, width) => {
  for (const chip of draw(width, 1, 'passages')) {
    expect(chip.text.children).toMatch(/^\w+$/);
    expect(chip.text.numberOfLines).toBeUndefined();
    expect(chip.style).toMatchObject({ minHeight: 36, maxWidth: '100%' });
    expect(chip.style.alignSelf).toBeUndefined();
  }
});
