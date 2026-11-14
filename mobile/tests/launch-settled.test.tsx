import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { RootLaunchCover } from '../src/launch/RootLaunchCover';

// Journeys tap the tab bar straight after launch. The cover is hidden from
// accessibility, so they cannot see it: the probe says it has gone.
const mockBuild = { isProduction: false };
jest.mock('../src/design/environment', () => ({
  get isProduction() {
    return mockBuild.isProduction;
  },
}));
const mockCover: { onDone?: () => void } = {};
jest.mock('../src/launch/LaunchHandoff', () => {
  const { View } = jest.requireActual('react-native');
  return {
    RootLaunchHandoff: ({ onDone }: { onDone: () => void }) => {
      mockCover.onDone = onDone;
      return <View testID="launch-handoff" />;
    },
  };
});

const insets = { top: 62, left: 0, right: 0, bottom: 34 };
let view: ReactTestRenderer | undefined;
const mount = () => {
  act(() => {
    view = create(
      <SafeAreaInsetsContext.Provider value={insets}>
        <RootLaunchCover />
      </SafeAreaInsetsContext.Provider>,
    );
  });
};
const ids = (id: string) =>
  view!.root.findAll(
    (n) => typeof n.type === 'string' && n.props.testID === id,
  );

beforeEach(() => {
  mockBuild.isProduction = false;
  mockCover.onDone = undefined;
});
afterEach(() => {
  act(() => view?.unmount());
  view = undefined;
});

test('the probe is drawn only once the cover has handed over', () => {
  mount();
  expect(ids('launch-handoff')).toHaveLength(1);
  expect(ids('launch-settled')).toHaveLength(0);
  act(() => mockCover.onDone!());
  expect(ids('launch-handoff')).toHaveLength(0);
  const probe = ids('launch-settled');
  expect(probe).toHaveLength(1);
  const { props } = probe[0]!;
  // Found by UI tests: accessible, labelled, never hidden, never in the way.
  expect(props.accessible).toBe(true);
  expect(props.accessibilityLabel).toBe('Launch settled');
  expect(props).not.toHaveProperty('accessibilityElementsHidden');
  expect(props.pointerEvents).toBe('none');
  expect(props.style).toMatchObject({
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
  });
  expect(props.style.opacity).toBeGreaterThanOrEqual(0.02);
  expect(props.style.top).toBeGreaterThan(insets.top);
});

test('release builds hand over to nothing', () => {
  mockBuild.isProduction = true;
  mount();
  act(() => mockCover.onDone!());
  expect(ids('launch-handoff')).toHaveLength(0);
  expect(ids('launch-settled')).toHaveLength(0);
  expect(view!.toJSON()).toBeNull();
});
