import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OpaxIPad } from '../modules/opax-ipad';
import { installKeyCommands, keyCommandSpecs } from '../src/design/keyboard';
import { WelcomeTour } from '../src/onboarding/WelcomeTour';

// The native module as on an iPad: UIKit receives the command list.
jest.mock('../modules/opax-ipad', () => ({
  OpaxIPad: {
    setKeyCommands: jest.fn(async () => undefined),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  PointerHoverView: null,
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
}));

const setKeyCommands = jest.mocked(OpaxIPad!.setKeyCommands);
/** The list UIKit holds now, as the Cmd-hold overlay shows it. */
const listed = () =>
  (setKeyCommands.mock.calls.at(-1)?.[0] ?? []).map(
    (spec) =>
      `${spec.input} ${spec.title}${spec.priority ? ' (priority)' : ''}`,
  );
const press = (root: ReactTestInstance, id: string) =>
  act(() =>
    root
      .find(
        (n) => n.props.testID === id && typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );

test('the tour lists only its own keys, titled, and gives the app its keys back', () => {
  expect(installKeyCommands()).toBe(true);
  expect(setKeyCommands).toHaveBeenLastCalledWith(
    keyCommandSpecs.map((spec) => ({ ...spec })),
  );
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 402, height: 874 },
          insets: { top: 62, left: 0, right: 0, bottom: 34 },
        }}
      >
        <WelcomeTour onLeave={jest.fn()} onClosed={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
  expect(listed()).toEqual([
    'left Previous page (priority)',
    'right Next page (priority)',
    'return Next',
    'escape Skip tour',
  ]);
  // On the last page Return is the finishing button, and says so.
  for (let i = 0; i < 4; i++) press(r.root, 'tour-next');
  expect(listed()).toContain('return Choose your electorate');
  act(() => r.unmount());
  expect(setKeyCommands).toHaveBeenLastCalledWith(
    keyCommandSpecs.map((spec) => ({ ...spec })),
  );
});
