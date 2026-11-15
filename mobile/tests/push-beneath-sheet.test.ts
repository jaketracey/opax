import { router } from 'expo-router';
import { pushBeneathSheet } from '../src/navigation/sheets';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

/**
 * A page pushed in the same commit as its sheet's close was laid out in the
 * closing sheet's frame: the A to Z glossary opened from a glossary term drew
 * in the top half of the screen with the rest blank (iPhone 16 Pro on iOS
 * 18.4 and iPhone 17 Pro on iOS 26.3). Two frames later it draws whole.
 */
test('the sheet closes at once and the page is pushed two frames later', () => {
  const queued: FrameRequestCallback[] = [];
  const frames = jest
    .spyOn(global, 'requestAnimationFrame')
    .mockImplementation((callback) => queued.push(callback));
  const order: string[] = [];
  jest.mocked(router.back).mockImplementation(() => void order.push('back'));
  jest.mocked(router.push).mockImplementation(() => void order.push('push'));

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
  frames.mockRestore();
});
