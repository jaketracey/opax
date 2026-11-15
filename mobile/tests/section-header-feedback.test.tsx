import { act, Profiler } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { SectionHeader } from '../src/design/layout';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useIsPreview: () => false,
  router: { push: jest.fn() },
}));

// Today's compact section header sets its action's margin from its title's
// measured height. That moves the title, and a text frame can differ by a
// pixel with where it sits: fed back unrounded, "Just declared" and its
// "See all" rendered on every frame, without end (found on the device with
// the first text-slack build, 15 Nov 2026).
test('a pixel of difference in the title frame does not feed back into the header', () => {
  let commits = 0;
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Profiler id="header" onRender={() => commits++}>
        <SectionHeader
          compact
          title="Just declared"
          testID="today-declared-heading"
          action={{
            accessibilityLabel: 'See all declarations',
            onPress: () => undefined,
            testID: 'today-declared-all',
          }}
        />
      </Profiler>,
    );
  });
  const title = () =>
    renderer.root
      .findAllByType(NativeText)
      .find((node) => node.props.testID === 'today-declared-heading')!;
  const frame = (height: number) =>
    act(() =>
      title().props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 309.667, height } },
      }),
    );
  frame(28.667);
  frame(29);
  frame(28.667);
  const settled = commits;
  // The two frames the device alternated between, 2,500 times in 3 seconds.
  for (let i = 0; i < 50; i++) {
    frame(29);
    frame(28.667);
  }
  expect(commits).toBe(settled);
  // A real change of height (a wrapped title) still moves the action.
  frame(57);
  expect(commits).toBeGreaterThan(settled);
  act(() => renderer.unmount());
});
