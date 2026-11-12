import { act } from 'react';
import { Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import ElectorateDateSheet, {
  onElectorateDate,
} from '../src/features/directories/ElectorateDateSheet';
import { RouteOptions } from '../src/navigation/preview';
import { loadElectorate } from '../src/features/Electorate';

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));
jest.mock('../src/features/Electorate', () => ({ loadElectorate: jest.fn() }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'fixture-seat', asof: '2024-05-01' }),
  router: { back: jest.fn() },
}));
const original = Platform.OS;
afterEach(() => {
  Platform.OS = original;
});
async function mount() {
  jest
    .mocked(loadElectorate)
    .mockResolvedValue({ view: { terms: [{ start: '2000-01-01' }] } } as never);
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(<ElectorateDateSheet />);
  });
  return view;
}

test('iOS keeps its inline calendar, date bounds and deferred Done action', async () => {
  Platform.OS = 'ios';
  const view = await mount();
  expect(
    view.root.findAllByProps({ testID: 'electorate-date-open' }),
  ).toHaveLength(0);
  const picker = view.root.findByType(DateTimePicker);
  expect(picker.props.display).toBe('inline');
  expect(picker.props.value.getFullYear()).toBe(2024);
  expect(picker.props.minimumDate.getFullYear()).toBe(2000);
  expect(
    view.root
      .findByType(RouteOptions)
      .props.options.unstable_headerRightItems()[0].label,
  ).toBe('Done');
  act(() => view.unmount());
});

test('Android can reopen its system calendar after selection and commits only on Done', async () => {
  Platform.OS = 'android';
  const chosen = jest.fn();
  const unsubscribe = onElectorateDate(chosen);
  const view = await mount();
  expect(view.root.findAllByType(DateTimePicker)).toHaveLength(0);
  const open = () =>
    view.root
      .find(
        (n) =>
          n.props.testID === 'electorate-date-open' &&
          typeof n.props.onPress === 'function',
      )
      .props.onPress();
  act(open);
  const picker = jest.mocked(DateTimePickerAndroid.open).mock.calls.at(-1)![0];
  expect(picker.display).toBe('calendar');
  expect(picker.minimumDate?.getFullYear()).toBe(2000);
  act(() =>
    picker.onValueChange!({} as never, new Date('2023-06-01T12:00:00')),
  );
  expect(chosen).not.toHaveBeenCalled();
  act(open);
  expect(
    jest
      .mocked(DateTimePickerAndroid.open)
      .mock.calls.at(-1)![0]
      .value.getFullYear(),
  ).toBe(2023);
  act(() =>
    view.root
      .findByType(RouteOptions)
      .props.options.unstable_headerRightItems()[0]
      .onPress(),
  );
  expect(chosen).toHaveBeenCalledWith('fixture-seat', '2023-06-01');
  unsubscribe();
  act(() => view.unmount());
});
