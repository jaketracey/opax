const mockHaptic = jest.fn(() => Promise.resolve());
jest.mock('../modules/opax-share', () => ({
  OpaxShare: { haptic: (kind: string) => mockHaptic(kind) },
}));
let mockOS = 'ios';
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  Object.defineProperty(rn.Platform, 'OS', { get: () => mockOS });
  return rn;
});
import { haptic } from '../src/design/haptics';

beforeEach(() => mockHaptic.mockClear());

test('iOS keeps every haptic, including the light share tap', () => {
  mockOS = 'ios';
  haptic('light');
  haptic('selection');
  haptic('success');
  expect(mockHaptic.mock.calls).toEqual([
    ['light'],
    ['selection'],
    ['success'],
  ]);
});

test('Android keeps selection and success but drops the light tap', () => {
  mockOS = 'android';
  haptic('light');
  haptic();
  haptic('selection');
  haptic('success');
  expect(mockHaptic.mock.calls).toEqual([['selection'], ['success']]);
});
