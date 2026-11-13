import { act } from 'react';
import { Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { confirmAction } from '../src/design/menu';
import { AskSuggestionRow } from '../src/features/ask/AskRows';

jest.mock('../src/design/menu', () => ({ confirmAction: jest.fn() }));
jest.mock('../src/api/runtime', () => ({ client: {}, catalogs: {} }));

const originalOS = Platform.OS;
function platform(os: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
}
afterEach(() => {
  platform(originalOS as 'android' | 'ios');
  jest.clearAllMocks();
});

test.each(['android', 'ios'] as const)(
  '%s starter row long press opens its menu (Android anchors it to the row)',
  (os) => {
    platform(os);
    const edit = jest.fn();
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <AskSuggestionRow
          question="What has parliament said about aged care?"
          variant="send"
          onPress={jest.fn()}
          menu={[{ title: 'Edit before asking', onPress: edit }]}
          testID="ask-starter-0"
        />,
      );
    });
    const row = r.root.find(
      (node) =>
        typeof node.type !== 'string' &&
        node.props.testID === 'ask-starter-0' &&
        typeof node.props.onLongPress === 'function',
    );
    act(() => row.props.onLongPress());
    const [title, actions, anchor] = jest.mocked(confirmAction).mock.calls[0]!;
    expect(title).toBe('What has parliament said about aged care?');
    expect(actions.map((a) => a.title)).toEqual(['Edit before asking']);
    if (os === 'android') {
      // The row itself is the trigger: the menu measures it and opens beside
      // it, and focus returns to it. Without one it fell back to the corner.
      expect(anchor).toBeTruthy();
      expect(anchor).not.toEqual(expect.any(Number));
    } else expect(anchor).toBeUndefined();
    act(() => r.unmount());
  },
);
