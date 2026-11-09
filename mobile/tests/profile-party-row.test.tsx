import { act } from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Text } from '../src/design/text';
import { ProfileHeader, PartyDot } from '../src/features/people/ProfileHeader';

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

test('the party dot precedes the name in a row and centres on its first line', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ProfileHeader
        name="Anthony Albanese"
        testID="person-header"
        identityRows={[
          {
            kind: 'party',
            title: 'Labor',
            dot: 'Labor',
            testID: 'person-party',
          },
        ]}
      />,
    );
  });
  const dot = renderer.root.findByType(PartyDot);
  let line = dot.parent!;
  while (StyleSheet.flatten(line.props.style)?.flexDirection !== 'row')
    line = line.parent!;
  expect(StyleSheet.flatten(line.props.style)).toMatchObject({
    flexDirection: 'row',
    alignItems: 'flex-start',
  });
  expect(
    (line.children[0] as TestRenderer.ReactTestInstance).findAllByType(
      PartyDot,
    ),
  ).toHaveLength(1);
  const name = line.findByType(Text);
  expect(name.props.children).toBe('Labor');
  expect(name.props.numberOfLines).toBeUndefined();
  act(() =>
    name.props.onTextLayout({ nativeEvent: { lines: [{ height: 52 }] } }),
  );
  const dotFrame = renderer.root
    .findAllByType(View)
    .find((node) => StyleSheet.flatten(node.props.style)?.height === 52)!;
  expect(StyleSheet.flatten(dotFrame.props.style)).toMatchObject({
    height: 52,
    justifyContent: 'center',
  });
  act(() => renderer.unmount());
});
