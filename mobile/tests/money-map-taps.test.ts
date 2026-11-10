import { DOUBLE_TAP_MS } from '../src/features/money/map/camera';
import { TapRouter } from '../src/features/money/map/taps';

describe('TapRouter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('a lone tap is reported once the double-tap window has passed', () => {
    const single = jest.fn(),
      double = jest.fn();
    const router = new TapRouter(single, double);
    expect(router.tap(10, 20, 1000)).toBe('pending');
    expect(single).not.toHaveBeenCalled();
    jest.advanceTimersByTime(DOUBLE_TAP_MS - 1);
    expect(single).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(single).toHaveBeenCalledWith(10, 20);
    expect(double).not.toHaveBeenCalled();
  });

  test('a second tap inside the window is a double tap, and the single never fires', () => {
    const single = jest.fn(),
      double = jest.fn();
    const router = new TapRouter(single, double);
    router.tap(10, 20, 1000);
    expect(router.tap(14, 18, 1000 + DOUBLE_TAP_MS - 10)).toBe('double');
    expect(double).toHaveBeenCalledWith(14, 18);
    jest.advanceTimersByTime(DOUBLE_TAP_MS * 2);
    expect(single).not.toHaveBeenCalled();
    // The pair is spent: a third tap starts again.
    expect(router.tap(14, 18, 1000 + DOUBLE_TAP_MS)).toBe('pending');
  });

  test('two taps too far apart in time or place are two single taps', () => {
    const single = jest.fn(),
      double = jest.fn();
    const router = new TapRouter(single, double);
    router.tap(10, 20, 1000);
    jest.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(router.tap(10, 20, 1000 + DOUBLE_TAP_MS + 5)).toBe('pending');
    jest.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(single).toHaveBeenCalledTimes(2);
    router.tap(10, 20, 5000);
    expect(router.tap(200, 20, 5050)).toBe('pending');
    jest.advanceTimersByTime(DOUBLE_TAP_MS);
    // The second tap replaced the first's wait: only the later point is reported.
    expect(single).toHaveBeenCalledTimes(3);
    expect(single).toHaveBeenLastCalledWith(200, 20);
    expect(double).not.toHaveBeenCalled();
  });

  test('cancel drops a waiting tap', () => {
    const single = jest.fn();
    const router = new TapRouter(single, jest.fn());
    router.tap(1, 2, 1000);
    router.cancel();
    jest.advanceTimersByTime(DOUBLE_TAP_MS * 2);
    expect(single).not.toHaveBeenCalled();
  });
});
