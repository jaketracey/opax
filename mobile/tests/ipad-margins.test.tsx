import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useScreenMargin } from '../src/design/adaptive';
import { rhythm, rhythmRegular } from '../src/design/tokens';

let mockWidth = 375;
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: { value: { ...actual.Platform, isPad: true } },
    useWindowDimensions: {
      value: () => ({ width: mockWidth, height: 1024, scale: 2, fontScale: 1 }),
    },
  });
});

test.each([
  [375, 16],
  [414, rhythm.screen],
  [1024, rhythmRegular.screen],
])('useScreenMargin at %s pt returns %s pt', (width, expected) => {
  mockWidth = width;
  let margin: number | undefined;
  function Harness() {
    margin = useScreenMargin();
    return null;
  }
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(<Harness />);
  });
  expect(margin).toBe(expected);
  act(() => view.unmount());
});
