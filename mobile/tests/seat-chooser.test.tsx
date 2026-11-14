import { withNavigationOptions } from './navigation-options';
import { router } from 'expo-router';
import { act } from 'react';
import {
  Dimensions,
  Linking,
  Platform,
  StyleSheet,
  Text as NativeText,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import TestRenderer from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import { confirmAction } from '../src/design/menu';
import { suggestFromLocation } from '../src/features/electorate-map/location';
import { CHOSEN_MARK_MS, SeatChooser } from '../src/features/seat/SeatChooser';
import { LocationRow } from '../src/features/seat/LocationRow';
import {
  FieldClearance,
  bottomFieldClearance,
  BOTTOM_FIELD_HEIGHT,
} from '../src/features/seat/FieldClearance';
import { SeatStateList } from '../src/features/seat/SeatStateList';
import { liquidGlass } from '../src/design/glass';
import { forgetChoice } from '../src/features/your-mp/choice-store';
import { closeWelcome, markWelcomeSeen } from '../src/onboarding/state';
import { index, manifest, people, roster, slugs } from './pinned';

const mockScreen: { options: Record<string, any> } = { options: {} };
const mockGoBack = jest.fn();
type Transition = (event: { data: { closing: boolean } }) => void;
const mockTransitions = new Set<Transition>();
const mockParentTransitions = new Set<Transition>();
const mockNavigation = {
  isFocused: jest.fn(() => true),
  addListener: jest.fn((_event: string, listener: Transition) => {
    mockTransitions.add(listener);
    return () => mockTransitions.delete(listener);
  }),
  getParent: () => ({
    goBack: mockGoBack,
    addListener: (_event: string, listener: Transition) => {
      mockParentTransitions.add(listener);
      return () => mockParentTransitions.delete(listener);
    },
  }),
};
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => mockNavigation,
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      mockScreen.options = options;
      return null;
    },
  },
}));
jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn(async () => null) },
  catalogs: { directory: jest.fn(), electorate: jest.fn() },
}));
jest.mock('../src/features/CachedPortrait', () => ({
  CachedPortrait: () => null,
}));
jest.mock('../src/features/electorate-map/location', () => ({
  suggestFromLocation: jest.fn(),
}));
jest.mock('../src/features/your-mp/choice-store', () => ({
  forgetChoice: jest.fn(async () => undefined),
}));
const mockSeat: { current: Record<string, unknown> } = { current: {} };
jest.mock('../src/features/your-mp/useSeat', () => ({
  migratedSeat: () => null,
  useSeat: () => mockSeat.current,
}));
jest.mock('../src/design/menu', () => ({ confirmAction: jest.fn() }));
jest.mock('../src/navigation/external', () => ({ openSource: jest.fn() }));
jest.mock('../src/onboarding/state', () => ({
  closeWelcome: jest.fn(),
  markWelcomeSeen: jest.fn(async () => undefined),
}));

const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const directory = {
  manifest: result(manifest),
  people: result(people),
  roster: result(roster),
  slugs: result(slugs),
  electorates: result(index),
};
const grayndler = index.electorates.find(
  (s) => s.name === 'Grayndler' && s.status === 'current',
)!;
const sydney = index.electorates.find(
  (s) => s.name === 'Sydney' && s.chamber === 'representatives',
)!;
const batman = index.electorates.find((s) => s.name === 'Batman')!;
const choose = jest.fn(async () => undefined);
const chooseState = jest.fn(async () => undefined);
const wendouree = index.electorates.find((s) => s.name === 'Wendouree')!;
const westernVictoria = index.electorates.find(
  (s) => s.name === 'Western Victoria' && s.chamber === 'vic_lc',
)!;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockTransitions.clear();
  mockParentTransitions.clear();
  mockNavigation.isFocused.mockReturnValue(true);
  (runtime.directory as jest.Mock).mockResolvedValue(directory);
  mockSeat.current = { status: 'none', choose, chooseState };
  mockScreen.options = {};
  setFontScale(1);
});
// React Native's Jest window has fontScale 2, an accessibility size.
function setFontScale(fontScale: number, width = 390) {
  const window = { width, height: 844, scale: 3, fontScale };
  Dimensions.set({ window, screen: window });
}

async function render(element: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      withNavigationOptions(element, (options) => {
        mockScreen.options = options;
      }),
    );
  });
  return r;
}
const byID = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n) => n.props.testID === id && typeof n.type !== 'string');
const one = (r: TestRenderer.ReactTestRenderer, id: string) => {
  const [node] = byID(r, id);
  if (!node) throw new Error(`No ${id}`);
  return node;
};
const words = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(NativeText)
    .map((n) =>
      [n.props.children]
        .flat(3)
        .filter((c) => typeof c === 'string')
        .join(''),
    )
    .join('\n');
async function type(text: string) {
  await act(async () =>
    mockScreen.options.headerSearchBarOptions.onChangeText({
      nativeEvent: { text },
    }),
  );
}

describe('the sheet', () => {
  test('two row taps in one event batch save only the first choice and close once', async () => {
    jest.useFakeTimers();
    const r = await render(<SeatChooser presentation="sheet" />);
    await type('Syd');
    const row = one(r, `seat-row-${sydney.slug}`);
    await act(async () => {
      row.props.onPress();
      row.props.onPress();
    });
    expect(choose).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(CHOSEN_MARK_MS));
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
  test('"Your electorate" with Cancel, the location row, Browse by state and the footnote', async () => {
    const r = await render(<SeatChooser presentation="sheet" />);
    expect(mockScreen.options.title).toBe('Your electorate');
    const [cancel] = mockScreen.options.unstable_headerLeftItems();
    expect(cancel.label).toBe('Cancel');
    expect(mockScreen.options.headerSearchBarOptions).toMatchObject({
      placeholder: 'Electorate or member’s name',
      autoFocus: true,
      hideNavigationBar: false,
    });
    expect(byID(r, 'seat-sheet')).not.toHaveLength(0);
    expect(byID(r, 'use-my-location')).not.toHaveLength(0);
    for (const code of ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'])
      expect(byID(r, `seat-browse-${code}`)).not.toHaveLength(0);
    expect(one(r, 'seat-browse-nsw').props.value).toBe('46');
    expect(words(r)).toContain(
      'Your location is used once to find your electorate. Your choice is saved on this iPhone only.',
    );
    // Nothing is asked of location until the row is tapped.
    expect(suggestFromLocation).not.toHaveBeenCalled();
    act(() => cancel.onPress());
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    expect(markWelcomeSeen).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
  test('only one Cancel shows while the field is active, and it closes the sheet', async () => {
    const r = await render(<SeatChooser presentation="sheet" />);
    await act(async () => mockScreen.options.headerSearchBarOptions.onFocus());
    expect(mockScreen.options.unstable_headerLeftItems()).toEqual([]);
    await act(async () =>
      mockScreen.options.headerSearchBarOptions.onCancelButtonPress(),
    );
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
  test('typing matches seats first, then senators as rows leading to their state', async () => {
    const r = await render(<SeatChooser presentation="sheet" />);
    await type('Albanese');
    expect(byID(r, `seat-row-${grayndler.slug}`)).not.toHaveLength(0);
    expect(byID(r, 'seat-browse-nsw')).toHaveLength(0);
    await type('Penny Wong');
    expect(byID(r, 'seat-results')).toHaveLength(0);
    await act(async () =>
      one(r, 'seat-person-lead-penny-wong').props.onPress(),
    );
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ code: 'sa' }),
      }),
    );
    await type('zzzz');
    expect(words(r)).toContain('No matching electorate or member.');
    expect(byID(r, 'seat-browse-sa')).not.toHaveLength(0);
    expect(byID(r, 'seat-aec')).not.toHaveLength(0);
    await act(async () => r.unmount());
  });
  test('choosing shows a checkmark, then closes the whole sheet', async () => {
    jest.useFakeTimers();
    const r = await render(<SeatChooser presentation="sheet" />);
    await type('Grayndler');
    await act(async () => one(r, `seat-row-${grayndler.slug}`).props.onPress());
    expect(choose).toHaveBeenCalledWith(grayndler);
    expect(one(r, `seat-row-${grayndler.slug}`).props.accessory).toBe(
      'checkmark',
    );
    expect(closeWelcome).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(CHOSEN_MARK_MS));
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
  test('a failed save keeps the sheet open with Try again', async () => {
    choose.mockRejectedValueOnce(new Error('disk'));
    const r = await render(<SeatChooser presentation="sheet" />);
    await type('Grayndler');
    await act(async () => one(r, `seat-row-${grayndler.slug}`).props.onPress());
    expect(byID(r, 'seat-save-error')).not.toHaveLength(0);
    expect(words(r)).toContain(
      'Your electorate couldn’t be saved on this iPhone.',
    );
    expect(closeWelcome).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
  test('the saved seat shows Saved, and removing it returns Today to the invitation', async () => {
    mockSeat.current = {
      status: 'chosen',
      choice: { version: 1, seatId: grayndler.electorate_id, stateSeatIds: [] },
      choose,
      forget: jest.fn(async () => undefined),
    };
    const r = await render(<SeatChooser presentation="sheet" />);
    expect(one(r, 'seat-saved-row').props.detail).toBe('Saved');
    expect(one(r, 'seat-saved-row').props.accessory).toBe('checkmark');
    await act(async () => one(r, 'seat-remove').props.onPress());
    const [[, actions]] = (confirmAction as jest.Mock).mock.calls;
    expect(actions[0]).toMatchObject({
      title: 'Remove electorate',
      destructive: true,
    });
    await act(async () => actions[0].onPress());
    // Through the seat's write queue, never straight to the store.
    expect(mockSeat.current.forget).toHaveBeenCalledTimes(1);
    expect(forgetChoice).not.toHaveBeenCalled();
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
  test('an abolished saved seat says so', async () => {
    mockSeat.current = {
      status: 'chosen',
      choice: { version: 1, seatId: batman.electorate_id, stateSeatIds: [] },
      choose,
    };
    const r = await render(<SeatChooser presentation="sheet" />);
    expect(one(r, 'seat-saved-row').props.detail).toBe(
      'Batman is no longer an electorate.',
    );
    await act(async () => r.unmount());
  });
});

describe('location', () => {
  test('cancelling before the directory answers prevents a later location permission request', async () => {
    let finishSeats!: (seats: typeof index.electorates) => void;
    const seats = () =>
      new Promise<typeof index.electorates>((resolve) => {
        finishSeats = resolve;
      });
    const r = await render(
      <LocationRow
        seats={seats}
        onChoose={jest.fn()}
        accessory={() => 'chevron'}
      />,
    );
    await act(async () => one(r, 'use-my-location').props.onPress());
    await act(async () => one(r, 'seat-location-finding').props.onPress());
    await act(async () => finishSeats(index.electorates));
    expect(suggestFromLocation).not.toHaveBeenCalled();
    expect(byID(r, 'use-my-location')).not.toHaveLength(0);
    await act(async () => r.unmount());
  });
  test('one ordinary answer row: "From your location", no checkmark until chosen', async () => {
    (suggestFromLocation as jest.Mock).mockResolvedValue({
      kind: 'suggested',
      seat: grayndler,
      vintage: '2025 election',
    });
    const r = await render(<SeatChooser presentation="sheet" />);
    await act(async () => one(r, 'use-my-location').props.onPress());
    const row = one(r, 'seat-location-row');
    expect(row.props.meta).toBe('From your location');
    expect(row.props.accessory).toBe('chevron');
    expect(words(r)).toContain(
      'Based on the 2025 boundaries. Check it’s right.',
    );
    await act(async () => row.props.onPress());
    expect(choose).toHaveBeenCalledWith(grayndler);
    await act(async () => r.unmount());
  });
  test('near a line: each nearby seat is a "Near your location" row, with no footer warning', async () => {
    (suggestFromLocation as jest.Mock).mockResolvedValue({
      kind: 'border',
      seats: [grayndler, sydney],
      vintage: '2025 election',
    });
    const r = await render(<SeatChooser presentation="sheet" />);
    await act(async () => one(r, 'use-my-location').props.onPress());
    for (const s of [grayndler, sydney])
      expect(one(r, `seat-location-row-${s.slug}`).props.meta).toBe(
        'Near your location',
      );
    expect(words(r)).not.toMatch(/boundary/i);
    await act(async () => r.unmount());
  });
  test('Precise Location off: one line, Open Settings, and the seats in the radius', async () => {
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    (suggestFromLocation as jest.Mock).mockResolvedValue({
      kind: 'approximate',
      seats: [grayndler, sydney],
      vintage: '2025 election',
    });
    const r = await render(<SeatChooser presentation="sheet" />);
    await act(async () => one(r, 'use-my-location').props.onPress());
    expect(byID(r, 'location-approximate')).not.toHaveLength(0);
    expect(words(r)).toContain('Precise Location is off for OPAX.');
    expect(byID(r, `seat-location-row-${sydney.slug}`)).not.toHaveLength(0);
    await act(async () => one(r, 'seat-location-settings').props.onPress());
    expect(open).toHaveBeenCalled();
    await act(async () => r.unmount());
  });
  test('denied: the row stays, with Open Settings', async () => {
    (suggestFromLocation as jest.Mock).mockResolvedValue({ kind: 'denied' });
    const r = await render(<SeatChooser presentation="sheet" />);
    await act(async () => one(r, 'use-my-location').props.onPress());
    expect(byID(r, 'location-denied')).not.toHaveLength(0);
    expect(byID(r, 'seat-location-settings')).not.toHaveLength(0);
    expect(byID(r, 'use-my-location')).not.toHaveLength(0);
    await act(async () => r.unmount());
  });
  test('typing stops a running locate and returns to idle silently', async () => {
    (suggestFromLocation as jest.Mock).mockReturnValue(new Promise(() => {}));
    const r = await render(<SeatChooser presentation="sheet" />);
    await act(async () => one(r, 'use-my-location').props.onPress());
    expect(byID(r, 'seat-location-finding')).not.toHaveLength(0);
    const signal = (suggestFromLocation as jest.Mock).mock.calls[0][2];
    await type('G');
    await type('');
    expect(signal.aborted).toBe(true);
    expect(byID(r, 'seat-location-finding')).toHaveLength(0);
    expect(byID(r, 'use-my-location')).not.toHaveLength(0);
    expect(words(r)).not.toContain('couldn’t be found');
    await act(async () => r.unmount());
  });
  test('at AX5 on a 375 pt iPhone the location line shrinks and wraps, never clips', async () => {
    setFontScale(3.12, 375);
    (suggestFromLocation as jest.Mock).mockResolvedValue({
      kind: 'border',
      seats: [grayndler, sydney],
      vintage: '2025 election',
    });
    const r = await render(<SeatChooser presentation="sheet" />);
    await act(async () => one(r, 'use-my-location').props.onPress());
    const lines = r.root.findAll(
      (n) => n.type === NativeText && n.props.children === 'Near your location',
    );
    expect(lines).toHaveLength(2);
    const style = (n: TestRenderer.ReactTestInstance) =>
      Object.assign(
        {},
        ...[n.props.style]
          .flat(5)
          .filter((s): s is object => !!s && typeof s === 'object'),
      ) as Record<string, unknown>;
    for (const line of lines) {
      expect(style(line).flexShrink).toBe(1);
      // The glyph and the words stack at accessibility sizes.
      const row = line.parent!.parent!;
      const container = [row, row.parent!].find(
        (n) => typeof n.type === 'string' && style(n).flexDirection,
      )!;
      expect(style(container).flexDirection).toBe('column');
      expect(style(container).flexWrap).toBe('nowrap');
    }
    await act(async () => r.unmount());
  });
  test('locate=1 starts the location row at once and leaves the field unfocused', async () => {
    (suggestFromLocation as jest.Mock).mockReturnValue(new Promise(() => {}));
    const r = await render(<SeatChooser presentation="sheet" locate />);
    expect(suggestFromLocation).toHaveBeenCalledTimes(1);
    expect(mockScreen.options.headerSearchBarOptions.autoFocus).toBe(false);
    await act(async () => r.unmount());
  });
  test.each([1, 3.12])(
    'at scale %s the sheet focuses after the native field attaches and the modal arrives',
    async (fontScale) => {
      setFontScale(fontScale);
      const r = await render(<SeatChooser presentation="sheet" />);
      const search = mockScreen.options.headerSearchBarOptions;
      expect(search.autoFocus).toBe(true);
      const focus = jest.fn();
      // Header search mounts after the chooser's effects. autoFocus alone
      // cannot focus an iOS search bar, and the initial ref was still null.
      search.ref.current = { focus };
      for (const listeners of [mockTransitions, mockParentTransitions]) {
        focus.mockClear();
        act(() =>
          listeners.forEach((listener) =>
            listener({ data: { closing: true } }),
          ),
        );
        expect(focus).not.toHaveBeenCalled();
        act(() =>
          listeners.forEach((listener) =>
            listener({ data: { closing: false } }),
          ),
        );
        expect(focus).toHaveBeenCalledTimes(1);
        mockNavigation.isFocused.mockReturnValue(false);
        act(() =>
          listeners.forEach((listener) =>
            listener({ data: { closing: false } }),
          ),
        );
        expect(focus).toHaveBeenCalledTimes(1);
        mockNavigation.isFocused.mockReturnValue(true);
      }
      await act(async () => r.unmount());
      expect(mockTransitions.size).toBe(0);
      expect(mockParentTransitions.size).toBe(0);
    },
  );
  test.each([1, 3.12])(
    'at scale %s the welcome leaves the field unfocused (your-mp 4.10)',
    async (fontScale) => {
      setFontScale(fontScale);
      const r = await render(<SeatChooser presentation="welcome" />);
      expect(mockScreen.options.headerSearchBarOptions.autoFocus).toBe(false);
      expect(mockTransitions.size).toBe(0);
      await act(async () => r.unmount());
    },
  );
});

describe('the welcome seat step', () => {
  test('"Not now" trailing records the decline and closes the welcome', async () => {
    const r = await render(<SeatChooser presentation="welcome" />);
    expect(byID(r, 'welcome-seat')).not.toHaveLength(0);
    expect(byID(r, 'seat-remove')).toHaveLength(0);
    const [notNow] = mockScreen.options.unstable_headerRightItems();
    expect(notNow.label).toBe('Not now');
    act(() => notNow.onPress());
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: true });
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
  test('a replay shows the saved seat and offers Done', async () => {
    mockSeat.current = {
      status: 'chosen',
      choice: { version: 1, seatId: grayndler.electorate_id, stateSeatIds: [] },
      choose,
    };
    const r = await render(<SeatChooser presentation="welcome" />);
    expect(byID(r, 'seat-saved-row')).not.toHaveLength(0);
    const [done] = mockScreen.options.unstable_headerRightItems();
    expect(done.label).toBe('Done');
    act(() => done.onPress());
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: false });
    await act(async () => r.unmount());
  });
  test('Browse pushes the state list inside the welcome', async () => {
    const r = await render(<SeatChooser presentation="welcome" />);
    await act(async () => one(r, 'seat-browse-vic').props.onPress());
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: expect.stringContaining('/welcome/seat/state/'),
      }),
    );
    await act(async () => r.unmount());
  });
  test('choosing a seat marks the welcome seen without declining', async () => {
    jest.useFakeTimers();
    const r = await render(<SeatChooser presentation="welcome" />);
    await type('Grayndler');
    await act(async () => one(r, `seat-row-${grayndler.slug}`).props.onPress());
    await act(async () => jest.advanceTimersByTime(CHOSEN_MARK_MS));
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: false });
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
});

describe('Browse by state', () => {
  test("the state's seats A to Z, titled with its name; choosing closes the whole modal", async () => {
    jest.useFakeTimers();
    const r = await render(<SeatStateList code="nsw" presentation="sheet" />);
    expect(mockScreen.options.title).toBe('New South Wales');
    const rows = byID(r, 'seat-state-list')[0]!.findAll(
      (n) =>
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('seat-row-') &&
        n.props.seat !== undefined,
    );
    const names = [...new Set(rows.map((n) => n.props.seat.name as string))];
    expect(names).toHaveLength(46);
    expect(names).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, 'en-AU')),
    );
    await act(async () => one(r, `seat-row-${grayndler.slug}`).props.onPress());
    await act(async () => jest.advanceTimersByTime(CHOSEN_MARK_MS));
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    expect(markWelcomeSeen).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
  test('a failed save says so with Try again, and stays open', async () => {
    choose.mockRejectedValueOnce(new Error('disk'));
    const r = await render(<SeatStateList code="nsw" presentation="sheet" />);
    await act(async () => one(r, `seat-row-${grayndler.slug}`).props.onPress());
    expect(byID(r, 'seat-save-error')).not.toHaveLength(0);
    expect(words(r)).toContain(
      'Your electorate couldn’t be saved on this iPhone.',
    );
    expect(closeWelcome).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
});

describe('the Victorian scope', () => {
  test('"Victorian electorate": districts and regions under two headers, no Browse by state', async () => {
    const r = await render(<SeatChooser presentation="sheet" scope="vic" />);
    expect(mockScreen.options.title).toBe('Victorian electorate');
    expect(mockScreen.options.headerSearchBarOptions.placeholder).toBe(
      'District, region or member’s name',
    );
    expect(one(r, 'seat-vic-districts').props.header).toBe(
      'Legislative Assembly districts',
    );
    expect(one(r, 'seat-vic-regions').props.header).toBe(
      'Legislative Council regions',
    );
    expect(byID(r, 'state-use-my-location')).not.toHaveLength(0);
    expect(byID(r, 'use-my-location')).toHaveLength(0);
    expect(byID(r, 'seat-browse-vic')).toHaveLength(0);
    await type('Wendouree');
    expect(byID(r, `seat-row-${wendouree.slug}`)).not.toHaveLength(0);
    expect(byID(r, 'seat-vic-regions')).toHaveLength(0);
    await act(async () => r.unmount());
  });
  test('choosing a district sets its region too, in one write', async () => {
    jest.useFakeTimers();
    (runtime.electorate as jest.Mock).mockResolvedValue({
      data: {
        relations: [
          {
            kind: 'within_upper_house',
            related_id: westernVictoria.electorate_id,
          },
        ],
      },
    });
    const r = await render(<SeatChooser presentation="sheet" scope="vic" />);
    await act(async () => one(r, `seat-row-${wendouree.slug}`).props.onPress());
    expect(runtime.electorate).toHaveBeenCalledWith(wendouree.detail_url);
    expect(chooseState).toHaveBeenCalledWith(wendouree, westernVictoria);
    expect(choose).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(CHOSEN_MARK_MS));
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
  test("a district whose record can't be read is set alone; a region sets the region", async () => {
    (runtime.electorate as jest.Mock).mockRejectedValue(new Error('offline'));
    const r = await render(<SeatChooser presentation="sheet" scope="vic" />);
    await act(async () => one(r, `seat-row-${wendouree.slug}`).props.onPress());
    expect(chooseState).toHaveBeenCalledWith(wendouree, undefined);
    await act(async () => r.unmount());
    const again = await render(
      <SeatChooser presentation="sheet" scope="vic" />,
    );
    await act(async () =>
      one(again, `seat-row-${westernVictoria.slug}`).props.onPress(),
    );
    expect(chooseState).toHaveBeenLastCalledWith(westernVictoria);
    await act(async () => again.unmount());
  });
  test('saved state seats carry a checkmark', async () => {
    mockSeat.current = {
      status: 'chosen',
      choice: {
        version: 1,
        seatId: grayndler.electorate_id,
        stateSeatIds: [wendouree.electorate_id],
      },
      choose,
      chooseState,
    };
    const r = await render(<SeatChooser presentation="sheet" scope="vic" />);
    expect(one(r, `seat-row-${wendouree.slug}`).props.accessory).toBe(
      'checkmark',
    );
    expect(byID(r, 'seat-saved')).toHaveLength(0);
    await act(async () => r.unmount());
  });
});

describe('the bottom search field', () => {
  const os = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
  function setPlatform(name: 'ios' | 'android', v: number | string) {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: name });
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: v,
    });
  }
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', os);
    Object.defineProperty(Platform, 'Version', version);
  });
  const reserve = (safeBottom: number) => safeBottom + BOTTOM_FIELD_HEIGHT + 8;

  test('iOS 26 iPhone leaves the safe area, field height and a gap', () => {
    expect(bottomFieldClearance(34, 'ios', false, true)).toBe(reserve(34));
    setPlatform('ios', '26.3');
    expect(bottomFieldClearance(34, 'ios', false)).toBe(reserve(34));
    setPlatform('ios', 27);
    expect(bottomFieldClearance(34, 'ios', false)).toBe(reserve(34));
  });
  test('iOS 18 iPhone keeps search in the bar, so no field reserve', () => {
    // 34 + 48 + 8 = 90 pt sat empty above the home indicator (18.4, 18.6).
    expect(bottomFieldClearance(34, 'ios', false, false)).toBe(0);
    setPlatform('ios', '18.6');
    expect(bottomFieldClearance(34, 'ios', false)).toBe(0);
    setPlatform('ios', '18.4');
    expect(bottomFieldClearance(34)).toBe(0);
  });
  test('iPad and Android are unchanged at 0 on every version', () => {
    for (const v of ['18.6', '26.3']) {
      setPlatform('ios', v);
      expect(bottomFieldClearance(20, 'ios', true)).toBe(0);
    }
    setPlatform('android', 36);
    expect(bottomFieldClearance(24, 'android', false)).toBe(0);
    expect(bottomFieldClearance(24)).toBe(0);
  });
  test('an Android API level is never read as an iOS version', () => {
    // API 36 with a caller's 'ios' once read as iOS 36: the field reserve.
    setPlatform('android', 36);
    expect(bottomFieldClearance(34, 'ios', false)).toBe(0);
    expect(liquidGlass()).toBe(false);
    expect(liquidGlass({ OS: 'android', Version: 36 })).toBe(false);
    for (const [v, glass] of [
      ['26.0.1', true],
      [27, true],
      ['18.10', false],
      [undefined, false],
    ] as const)
      expect(liquidGlass({ OS: 'ios', Version: v })).toBe(glass);
  });

  const padded = (r: TestRenderer.ReactTestRenderer, bottom: number) =>
    r.root
      .findByType(FieldClearance)
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          StyleSheet.flatten(n.props.style)?.paddingBottom === bottom,
      );
  const inset = (children: React.ReactNode) => (
    <SafeAreaInsetsContext.Provider
      value={{ top: 0, left: 0, right: 0, bottom: 34 }}
    >
      {children}
    </SafeAreaInsetsContext.Provider>
  );

  test.each([1, 3.12])(
    'iOS 26: at scale %s the AEC row scrolls inside a viewport inset above the field',
    async (fontScale) => {
      setPlatform('ios', '26.3');
      setFontScale(fontScale);
      const r = await render(inset(<SeatChooser presentation="sheet" />));
      const viewport = padded(r, reserve(34))[0]!;
      expect(viewport).toBeDefined();
      expect(
        viewport.findAll((n) => n.props.testID === 'seat-aec'),
      ).not.toHaveLength(0);
      await act(async () => r.unmount());
    },
  );
  test.each([
    ['sheet', <SeatChooser key="s" presentation="sheet" />],
    ['welcome', <SeatChooser key="w" presentation="welcome" />],
  ])(
    'iOS 18: the %s chooser runs to the bottom edge with no padded band',
    async (_name, chooser) => {
      setPlatform('ios', '18.6');
      setFontScale(3.12);
      const r = await render(inset(chooser));
      expect(padded(r, reserve(34))).toHaveLength(0);
      expect(
        StyleSheet.flatten(
          r.root.findByType(FieldClearance).findByType(View).props.style,
        ).paddingBottom,
      ).toBeUndefined();
      expect(byID(r, 'seat-aec')).not.toHaveLength(0);
      await act(async () => r.unmount());
    },
  );
});
