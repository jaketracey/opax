import { router } from 'expo-router';
import {
  leaveSheetThen,
  pushBeneathSheet,
  SHEET_DISMISS_MS,
} from '../src/navigation/sheets';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

let queued: FrameRequestCallback[];
let frames: jest.SpyInstance;
const order: string[] = [];
beforeEach(() => {
  jest.useFakeTimers();
  queued = [];
  order.length = 0;
  frames = jest
    .spyOn(global, 'requestAnimationFrame')
    .mockImplementation((callback) => queued.push(callback));
  jest.mocked(router.back).mockReset();
  jest.mocked(router.push).mockReset();
  jest.mocked(router.back).mockImplementation(() => void order.push('back'));
  jest.mocked(router.push).mockImplementation(() => void order.push('push'));
});
afterEach(() => {
  frames.mockRestore();
  jest.useRealTimers();
});

/**
 * A page pushed in the same commit as its sheet's close was laid out in the
 * closing sheet's frame: the A to Z glossary opened from a glossary term drew
 * in the top half of the screen with the rest blank (iPhone 16 Pro on iOS
 * 18.4 and iPhone 17 Pro on iOS 26.3). Two frames later it draws whole.
 */
test('the sheet closes at once and a page is pushed two frames later', () => {
  pushBeneathSheet({ pathname: '/learn/glossary' });
  expect(order).toEqual(['back']);
  expect(queued).toHaveLength(1);

  queued.shift()!(0);
  expect(order).toEqual(['back']);
  expect(queued).toHaveLength(1);

  queued.shift()!(0);
  expect(order).toEqual(['back', 'push']);
  expect(router.push).toHaveBeenCalledWith({ pathname: '/learn/glossary' });
  expect(queued).toHaveLength(0);
});

/**
 * Two frames in, the first sheet is still being dismissed: a sheet presented
 * then is dropped by react-native-screens and its stack stops presenting
 * sheets. A sheet target waits for the dismissal to end.
 */
test('a sheet is presented only once the closing sheet’s dismissal has ended', () => {
  pushBeneathSheet({ pathname: '/ask-report' } as never, 'sheet');
  expect(order).toEqual(['back']);
  // No frame path at all: frames would land mid-dismissal.
  expect(queued).toHaveLength(0);
  jest.advanceTimersByTime(SHEET_DISMISS_MS - 1);
  expect(order).toEqual(['back']);
  jest.advanceTimersByTime(1);
  expect(order).toEqual(['back', 'push']);
  expect(router.push).toHaveBeenCalledWith({ pathname: '/ask-report' });
  // 500 ms was too short on a loaded iOS 18.4 simulator: the sheet never
  // opened. Keep room above the dismissal's own half second.
  expect(SHEET_DISMISS_MS).toBeGreaterThanOrEqual(900);
});

test.each(['page', 'sheet'] as const)(
  'a second tap while a %s is pending closes nothing more and opens nothing twice',
  (target) => {
    const settle = () => {
      if (target === 'sheet') jest.advanceTimersByTime(SHEET_DISMISS_MS);
      else {
        queued.shift()!(0);
        queued.shift()!(0);
      }
    };
    pushBeneathSheet({ pathname: '/learn/glossary' }, target);
    pushBeneathSheet({ pathname: '/learn/glossary' }, target);
    const other = jest.fn();
    leaveSheetThen(other, target);
    expect(router.back).toHaveBeenCalledTimes(1);
    settle();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(queued).toHaveLength(0);
    // Once it has run, the next one goes through.
    pushBeneathSheet({ pathname: '/learn/glossary' }, target);
    expect(router.back).toHaveBeenCalledTimes(2);
    settle();
    expect(router.push).toHaveBeenCalledTimes(2);
  },
);

test('leaveSheetThen runs any action a later commit after the close', () => {
  const next = jest.fn(() => void order.push('next'));
  leaveSheetThen(next);
  expect(order).toEqual(['back']);
  queued.shift()!(0);
  expect(next).not.toHaveBeenCalled();
  queued.shift()!(0);
  expect(order).toEqual(['back', 'next']);
});
