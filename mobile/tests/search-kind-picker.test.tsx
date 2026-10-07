import { act } from 'react';
import { ActionSheetIOS } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Button } from '../src/design/primitives';
import { chrome } from '../src/design/tokens';
import { KindPicker } from '../src/features/search/KindPicker';

jest.mock('react-native/Libraries/ActionSheetIOS/ActionSheetIOS', () => ({
  __esModule: true,
  default: { showActionSheetWithOptions: jest.fn() },
}));

test('the native kind menu submits only its allowed selection and honours Cancel', () => {
  const sheet = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => undefined);
  const change = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <KindPicker value="person" onChange={change} />,
    );
  });
  act(() => renderer.root.findByType(Button).props.onPress());
  const [options, select] = sheet.mock.calls[0]!;
  // ActionSheetIOS rejects DynamicColorIOS objects before its native call.
  expect(typeof options.tintColor).toBe('string');
  expect(options.tintColor).toBe(chrome.tint);
  expect(options.options).toEqual([
    'People',
    'Declared interests',
    'Pay',
    'Expenses',
    'Records',
    'Political parties',
    'Government agencies',
    'Grants',
    'Bills',
    'Research reports',
    'Cancel',
  ]);
  select(options.cancelButtonIndex!);
  expect(change).not.toHaveBeenCalled();
  select(2);
  expect(change).toHaveBeenCalledWith('pay');
  sheet.mockRestore();
});
