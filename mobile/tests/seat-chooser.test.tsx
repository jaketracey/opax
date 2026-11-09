import { withNavigationOptions } from './navigation-options';
import { router } from 'expo-router';
import { act } from 'react';
import { Dimensions, Linking, Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import { confirmAction } from '../src/design/menu';
import { suggestFromLocation } from '../src/features/electorate-map/location';
import { CHOSEN_MARK_MS, SeatChooser } from '../src/features/seat/SeatChooser';
import { SeatStateList } from '../src/features/seat/SeatStateList';
import { forgetChoice } from '../src/features/your-mp/choice-store';
import { closeWelcome, markWelcomeSeen } from '../src/onboarding/state';
import { index, manifest, people, roster, slugs } from './pinned';

const mockScreen: { options: Record<string, any> } = { options: {} };
const mockGoBack = jest.fn();
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ getParent: () => ({ goBack: mockGoBack }) }),
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
    expect(forgetChoice).toHaveBeenCalledTimes(1);
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
  test('at accessibility sizes the field waits for a tap', async () => {
    setFontScale(2);
    const r = await render(<SeatChooser presentation="welcome" />);
    expect(mockScreen.options.headerSearchBarOptions.autoFocus).toBe(false);
    await act(async () => r.unmount());
  });
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

describe('the bottom search field (w4-seat-ax5-01)', () => {
  test('at accessibility sizes on iPhone the list ends above the field', () => {
    const { bottomFieldClearance, BOTTOM_FIELD_HEIGHT } = jest.requireActual<
      typeof import('../src/features/seat/FieldClearance')
    >('../src/features/seat/FieldClearance');
    // AX5 on iPhone: the safe area, the field and a gap.
    expect(bottomFieldClearance(3.12, 34, 'ios', false)).toBe(
      34 + BOTTOM_FIELD_HEIGHT + 8,
    );
    // Large: the list fits above the field or scrolls under its edge.
    expect(bottomFieldClearance(1, 34, 'ios', false)).toBe(0);
    // iPad keeps search in the bar; Android has no bottom field.
    expect(bottomFieldClearance(3.12, 20, 'ios', true)).toBe(0);
    expect(bottomFieldClearance(3.12, 0, 'android', false)).toBe(0);
  });
});
