import { act, type ReactElement } from 'react';
import * as RN from 'react-native';
import TestRenderer from 'react-test-renderer';
import { FollowButton, SwitchRow } from '../src/design/controls';
import { haptic } from '../src/design/haptics';
import { rowMenus, useRowFollow } from '../src/design/row-link';
import {
  follow,
  followWithFeedback,
  loadFollows,
  unfollow,
  useFollows,
} from '../src/features/follows/store';
import {
  feelSheetSnap,
  forgetSheetSnaps,
  sheetSnapListeners,
} from '../src/navigation/sheet-snap';
import { screen } from '../src/navigation/stack/screen';

jest.mock('../src/design/haptics', () => ({ haptic: jest.fn() }));
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/records/runtime', () => ({ records: {} }));
jest.mock('../src/features/follows/useFollowStates', () => ({
  markSeenNow: jest.fn(),
}));
jest.mock('../src/features/follows/store', () => ({
  FOLLOW_LIMIT: 50,
  useFollows: jest.fn(() => []),
  loadFollows: jest.fn(async () => []),
  followKey: jest.fn(
    (item: { kind: string; id: string }) => `${item.kind}:${item.id}`,
  ),
  follow: jest.fn(),
  followWithFeedback: jest.fn(),
  unfollow: jest.fn(async () => undefined),
}));

const felt = () => jest.mocked(haptic).mock.calls.map(([kind]) => kind);
let mounted: TestRenderer.ReactTestRenderer[] = [];
function render(element: ReactElement) {
  let result!: TestRenderer.ReactTestRenderer;
  act(() => {
    result = TestRenderer.create(element);
  });
  mounted.push(result);
  return result;
}
const control = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.find(
    (node) =>
      typeof node.type !== 'string' &&
      node.props.testID === id &&
      typeof node.props.onPress === 'function',
  );
const os = RN.Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  forgetSheetSnaps();
  RN.Platform.OS = 'ios';
  jest.mocked(useFollows).mockReturnValue([]);
  jest.mocked(loadFollows).mockResolvedValue([]);
});
afterEach(() => {
  act(() => mounted.forEach((r) => r.unmount()));
  mounted = [];
  RN.Platform.OS = os;
});

describe('a sheet settling on another detent', () => {
  const snap = (key: string, index: number, stable = true) =>
    sheetSnapListeners({ route: { key } }).sheetDetentChange({
      data: { index, stable },
    });

  test('iOS: each change the reader makes is one selection tap', () => {
    snap('citation-1', 1);
    expect(felt()).toEqual(['selection']);
    snap('citation-1', 0);
    expect(felt()).toEqual(['selection', 'selection']);
  });

  test('a repeated report of the same detent is silent, also after a remount', () => {
    snap('source-1', 1);
    // A remounted screen builds new listeners for the same route key.
    snap('source-1', 1);
    feelSheetSnap('source-1', { index: 1, stable: true });
    expect(felt()).toEqual(['selection']);
  });

  test('dragging and closing are silent', () => {
    snap('rule-1', 1, false);
    snap('rule-1', -1);
    snap('rule-1', 0.5);
    expect(felt()).toEqual([]);
  });

  test('each open sheet keeps its own detent', () => {
    snap('a', 1);
    snap('b', 1);
    expect(felt()).toEqual(['selection', 'selection']);
  });

  test('only the 24 most recently moved sheets are remembered', () => {
    for (let i = 0; i < 25; i += 1) snap(`sheet-${i}`, 1);
    jest.mocked(haptic).mockClear();
    // The newest 24 are still known: the same detent again is silent.
    for (let i = 1; i < 25; i += 1) snap(`sheet-${i}`, 1);
    expect(felt()).toEqual([]);
    // The oldest was dropped, so its report reads as a first snap again.
    snap('sheet-0', 1);
    expect(felt()).toEqual(['selection']);
  });

  test('moving a remembered sheet keeps it over an older, idle one', () => {
    for (let i = 0; i < 24; i += 1) snap(`sheet-${i}`, 1);
    snap('sheet-0', 0);
    snap('sheet-24', 1);
    jest.mocked(haptic).mockClear();
    snap('sheet-0', 0);
    expect(felt()).toEqual([]);
    snap('sheet-1', 1);
    expect(felt()).toEqual(['selection']);
  });

  test('Android: the sheet settling as it opens is not a snap', () => {
    RN.Platform.OS = 'android';
    snap('source-2', 0);
    expect(felt()).toEqual([]);
    snap('source-2', 1);
    snap('source-2', 1);
    expect(felt()).toEqual(['selection']);
  });

  test('every route registered through screen() listens for the snap', () => {
    expect(screen('ask-report', 'Report this answer').props.listeners).toBe(
      sheetSnapListeners,
    );
  });
});

describe('a switch row', () => {
  test('one selection tap per press, none from a remount or a disabled row', () => {
    const change = jest.fn();
    const row = (value: boolean) => (
      <SwitchRow
        label="Show former members"
        value={value}
        onValueChange={change}
        testID="switch"
      />
    );
    const r = render(row(false));
    expect(felt()).toEqual([]);
    act(() => control(r, 'switch').props.onPress());
    expect(change).toHaveBeenCalledWith(true);
    expect(felt()).toEqual(['selection']);
    // The new value arrives, then the row remounts with it.
    act(() => r.update(row(true)));
    act(() => r.unmount());
    mounted = [];
    const again = render(row(true));
    expect(felt()).toEqual(['selection']);
    expect(control(again, 'switch').props).toMatchObject({
      accessibilityRole: 'switch',
      accessibilityState: { checked: true, disabled: false },
    });
  });
});

describe('the Follow button', () => {
  test('Unfollow is one selection tap after the save, and a remount adds none', async () => {
    jest
      .mocked(useFollows)
      .mockReturnValue([{ kind: 'bill', id: 'b' }] as ReturnType<
        typeof useFollows
      >);
    const button = (
      <FollowButton kind="bill" id="b" title="A bill" testID="follow" />
    );
    const r = render(button);
    expect(felt()).toEqual([]);
    await act(async () => {
      await control(r, 'follow-on').props.onPress();
    });
    expect(unfollow).toHaveBeenCalledWith('bill:b');
    expect(felt()).toEqual(['selection']);
    act(() => r.unmount());
    mounted = [];
    jest.mocked(useFollows).mockReturnValue([]);
    render(button);
    expect(felt()).toEqual(['selection']);
  });

  test('an Unfollow that could not be saved is silent', async () => {
    jest
      .mocked(useFollows)
      .mockReturnValue([{ kind: 'bill', id: 'b' }] as ReturnType<
        typeof useFollows
      >);
    jest.mocked(unfollow).mockRejectedValueOnce(new Error('disk'));
    const r = render(
      <FollowButton kind="bill" id="b" title="A bill" testID="follow" />,
    );
    await act(async () => {
      await control(r, 'follow-on').props.onPress();
    });
    expect(felt()).toEqual([]);
  });

  test('Follow stays one success tap', async () => {
    jest
      .mocked(followWithFeedback)
      .mockResolvedValue({ status: 'followed', showMessage: false });
    const r = render(
      <FollowButton kind="bill" id="b" title="A bill" testID="follow" />,
    );
    await act(async () => {
      await control(r, 'follow-off').props.onPress();
    });
    expect(felt()).toEqual(['success']);
  });
});

describe('Follow from a row menu or a VoiceOver action', () => {
  let action: ReturnType<typeof useRowFollow>;
  function Probe() {
    action = useRowFollow('bill', 'au-example', 'Example Bill');
    return null;
  }
  const run = async () => {
    await act(async () => {
      action.onFollow();
      await new Promise((resolve) => setImmediate(resolve));
    });
  };

  test('a saved follow is one success tap; a remount adds none', async () => {
    jest.mocked(follow).mockResolvedValue('followed');
    const r = render(<Probe />);
    await run();
    expect(follow).toHaveBeenCalledTimes(1);
    expect(felt()).toEqual(['success']);
    act(() => r.unmount());
    mounted = [];
    render(<Probe />);
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
    expect(felt()).toEqual(['success']);
  });

  test('nothing plays at the follow limit', async () => {
    jest.mocked(follow).mockResolvedValue('limit');
    const alert = jest.spyOn(RN.Alert, 'alert').mockImplementation(() => {});
    render(<Probe />);
    await run();
    expect(alert).toHaveBeenCalledWith(
      'Following',
      'Unfollow an item to add another.',
    );
    expect(felt()).toEqual([]);
    alert.mockRestore();
  });

  test('a saved unfollow is one selection tap', async () => {
    jest
      .mocked(loadFollows)
      .mockResolvedValue([{ kind: 'bill', id: 'au-example' }] as Awaited<
        ReturnType<typeof loadFollows>
      >);
    render(<Probe />);
    await run();
    expect(unfollow).toHaveBeenCalledWith('bill:au-example');
    expect(follow).not.toHaveBeenCalled();
    expect(felt()).toEqual(['selection']);
  });

  test('the menu item leaves the tap to the save', () => {
    const onFollow = jest.fn();
    const items = rowMenus.place({
      title: 'Grayndler',
      path: '/subject/electorate/grayndler',
      following: false,
      onFollow,
    });
    const leaves = items.flatMap((item) =>
      'items' in item ? item.items : [item],
    );
    const followLeaf = leaves.find((leaf) => leaf.title === 'Follow')!;
    followLeaf.onPress();
    expect(onFollow).toHaveBeenCalledTimes(1);
    expect(felt()).toEqual([]);
  });
});
