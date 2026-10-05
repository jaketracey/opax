import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { Screen } from '../src/design/primitives';
import BillDetail from '../src/features/bills/BillDetail';
import { pinned, slugs } from './pinned';

const mockParams: { key: string; section?: string } = {
  key: 'au-federal-r7501',
  section: 'divisions',
};
let mockTransition:
  | ((event: { data: { closing: boolean } }) => void)
  | undefined;
const mockNavigation = {
  addListener: jest.fn((_event: string, listener: typeof mockTransition) => {
    mockTransition = listener;
    return () => {
      mockTransition = undefined;
    };
  }),
};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { billFor: jest.fn(), roster: jest.fn(), slugs: jest.fn() },
}));
const fixture = new Catalogs({
  get: async (path, decode) => ({
    data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});
beforeEach(async () => {
  jest.useFakeTimers();
  mockParams.section = 'divisions';
  mockTransition = undefined;
  jest
    .mocked(runtime.billFor)
    .mockResolvedValue(await fixture.billFor(mockParams.key));
  jest.mocked(runtime.roster).mockResolvedValue(await fixture.roster());
  jest.mocked(runtime.slugs).mockResolvedValue(await fixture.slugs());
});
afterEach(() => jest.useRealTimers());

async function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<BillDetail />);
  });
  const screen = renderer.root.findByType(Screen);
  const scrollTo = jest.fn();
  screen.props.scrollRef.current = { scrollTo };
  const layout = () =>
    act(() => {
      renderer.root
        .find(
          (n) =>
            typeof n.type === 'string' &&
            n.props.testID === 'bill-divisions-anchor',
        )
        .props.onLayout({ nativeEvent: { layout: { y: 2400 } } });
      screen.props.onContentSizeChange(390, 6000);
    });
  const enter = () => act(() => mockTransition?.({ data: { closing: false } }));
  const frames = () => act(() => jest.runOnlyPendingTimers());
  return { renderer, scrollTo, layout, enter, frames };
}

test.each(['layout-first', 'transition-first'])(
  'division link scrolls once after native opening and content sizing: %s',
  async (order) => {
    const r = await render();
    if (order === 'layout-first') r.layout();
    else r.enter();
    r.frames();
    expect(r.scrollTo).not.toHaveBeenCalled();
    if (order === 'layout-first') r.enter();
    else r.layout();
    r.frames();
    expect(r.scrollTo).toHaveBeenCalledWith({ y: 2384, animated: false });
    r.layout();
    r.enter();
    r.frames();
    expect(r.scrollTo).toHaveBeenCalledTimes(1);
    act(() => r.renderer.unmount());
  },
);
test('ordinary bill links and closing transitions do not jump', async () => {
  const closing = await render();
  closing.layout();
  act(() => mockTransition?.({ data: { closing: true } }));
  closing.frames();
  expect(closing.scrollTo).not.toHaveBeenCalled();
  act(() => closing.renderer.unmount());
  delete mockParams.section;
  const normal = await render();
  normal.layout();
  normal.enter();
  normal.frames();
  expect(normal.scrollTo).not.toHaveBeenCalled();
  act(() => normal.renderer.unmount());
});
