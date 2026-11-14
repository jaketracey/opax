import { withNavigationOptions } from './navigation-options';
import { act } from 'react';
import { Dimensions, Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { track } from '../src/analytics';
import { catalogs as runtime } from '../src/api/runtime';
import { suggestFromLocation } from '../src/features/electorate-map/location';
import { CHOSEN_MARK_MS, SeatChooser } from '../src/features/seat/SeatChooser';
import { SeatStateList } from '../src/features/seat/SeatStateList';
import { seatCopy } from '../src/features/seat/seat-model';
import { invitationBody } from '../src/features/today/SeatInvitation';
import { closeWelcome, markWelcomeSeen } from '../src/onboarding/state';
import { index, manifest, people, roster, slugs } from './pinned';

// First-run drop-off (12 Nov): the welcome's electorate step always has a
// plain way on. These tests hold the ways out, the honest "no match" for a
// postcode or suburb, a refused location, and what the funnel may report.
const mockScreen: { options: Record<string, any> } = { options: {} };
const mockNavigation = {
  isFocused: jest.fn(() => true),
  addListener: jest.fn(() => () => undefined),
  getParent: () => ({
    goBack: jest.fn(),
    addListener: () => () => undefined,
  }),
};
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => mockNavigation,
  Stack: { Screen: () => null },
}));
jest.mock('../src/analytics', () => ({ track: jest.fn() }));
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
const choose = jest.fn(async () => undefined);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  (runtime.directory as jest.Mock).mockResolvedValue(directory);
  mockSeat.current = { status: 'none', choose };
  mockScreen.options = {};
  const window = { width: 390, height: 844, scale: 3, fontScale: 1 };
  Dimensions.set({ window, screen: window });
});

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
const saved = () => ({
  status: 'chosen',
  choice: { version: 1, seatId: grayndler.electorate_id, stateSeatIds: [] },
  choose,
});
const reports = () => (track as jest.Mock).mock.calls;

describe('skipping the electorate step', () => {
  test('the step says first what an electorate is, then how to find one without its name', async () => {
    const r = await render(<SeatChooser presentation="welcome" />);
    // Newcomer build (README 4.3, 4.4): the step explains the electorate,
    // Today's invitation explains the MP.
    expect(seatCopy.why).toBe(
      'Your electorate is the area you vote in. Find yours and OPAX will show you your MP: who they are, and how they vote.',
    );
    expect(seatCopy.whyHelp).toBe(
      'Not sure of its name? Use your location and OPAX will find it.',
    );
    expect(invitationBody(null)).toBe(seatCopy.invitation);
    expect(words(r)).toContain(seatCopy.why);
    expect(words(r)).toContain(seatCopy.whyHelp);
    // First in the list, before the location row.
    const ids = r.root
      .findAll(
        (n) =>
          typeof n.type !== 'string' &&
          ['welcome-seat-why', 'welcome-seat-help', 'use-my-location'].includes(
            n.props.testID,
          ),
      )
      .map((n) => n.props.testID as string);
    expect([...new Set(ids)]).toEqual([
      'welcome-seat-why',
      'welcome-seat-help',
      'use-my-location',
    ]);
    await act(async () => r.unmount());
  });
  test('"Choose later" is a full button that says where to choose again, and lands in the app', async () => {
    const r = await render(<SeatChooser presentation="welcome" />);
    const later = one(r, 'seat-choose-later');
    expect(later.props.label).toBe('Choose later');
    expect(later.props.fullWidth).toBe(true);
    expect(words(r)).toContain(
      'You can add your electorate any time from Today or Your MP.',
    );
    act(() => later.props.onPress());
    // The same as the bar's "Not now": the decline is recorded (so Today
    // opens on content, the invitation after Bills) and the welcome closes.
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: true });
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    expect(reports()).toEqual([
      ['opax_first_run', { step: 'seat', outcome: 'skipped' }],
    ]);
    await act(async () => r.unmount());
  });
  test('the bar keeps "Not now", and it reports the same skip', async () => {
    const r = await render(<SeatChooser presentation="welcome" />);
    const [notNow] = mockScreen.options.unstable_headerRightItems();
    expect(notNow.label).toBe('Not now');
    act(() => notNow.onPress());
    expect(reports()).toEqual([
      ['opax_first_run', { step: 'seat', outcome: 'skipped' }],
    ]);
    await act(async () => r.unmount());
  });
  test('the sheet has Cancel instead: no reason line, no "Choose later", nothing reported', async () => {
    const r = await render(<SeatChooser presentation="sheet" />);
    expect(byID(r, 'welcome-seat-why')).toHaveLength(0);
    expect(byID(r, 'welcome-seat-help')).toHaveLength(0);
    expect(byID(r, 'seat-choose-later')).toHaveLength(0);
    const [cancel] = mockScreen.options.unstable_headerLeftItems();
    act(() => cancel.onPress());
    expect(reports()).toEqual([]);
    await act(async () => r.unmount());
  });
  test('a replay with a seat saved offers Done only, and Done is not a skip', async () => {
    mockSeat.current = saved();
    const r = await render(<SeatChooser presentation="welcome" />);
    expect(byID(r, 'welcome-seat-why')).toHaveLength(0);
    expect(byID(r, 'seat-choose-later')).toHaveLength(0);
    const [done] = mockScreen.options.unstable_headerRightItems();
    act(() => done.onPress());
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: false });
    expect(reports()).toEqual([]);
    await act(async () => r.unmount());
  });
  test('"Choose later" waits while a choice is being saved', async () => {
    let finish!: () => void;
    choose.mockImplementationOnce(
      () =>
        new Promise<undefined>(
          (resolve) => (finish = () => resolve(undefined)),
        ),
    );
    const r = await render(<SeatChooser presentation="welcome" />);
    await type('Grayndler');
    await act(async () => one(r, `seat-row-${grayndler.slug}`).props.onPress());
    await type('');
    expect(one(r, 'seat-choose-later').props.disabled).toBe(true);
    await act(async () => finish());
    await act(async () => r.unmount());
  });
});

describe('a postcode or suburb in the search field', () => {
  test('a postcode is answered plainly, with location, Browse, the AEC and "Choose later" straight after', async () => {
    const r = await render(<SeatChooser presentation="welcome" />);
    await type('2042');
    expect(one(r, 'seat-no-results').props.children).toBe(
      'OPAX can’t look up postcodes yet.',
    );
    expect(one(r, 'seat-no-results-help').props.children).toBe(
      'Use your location, or check your address with the AEC to find your electorate’s name.',
    );
    expect(words(r)).not.toContain('No matching electorate or member.');
    for (const id of [
      'use-my-location',
      'seat-browse-nsw',
      'seat-aec',
      'seat-choose-later',
    ])
      expect(byID(r, id)).not.toHaveLength(0);
    // Nothing is asked of location until its row is tapped.
    expect(suggestFromLocation).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
  test('a part-typed postcode gets the same line, never "no match"', async () => {
    const r = await render(<SeatChooser presentation="sheet" />);
    for (const text of ['2', '20', '204', ' 2042 ']) {
      await type(text);
      expect(one(r, 'seat-no-results').props.children).toBe(
        'OPAX can’t look up postcodes yet.',
      );
    }
    await act(async () => r.unmount());
  });
  test('a suburb that is no electorate says places are not searched, and offers the same ways on', async () => {
    const r = await render(<SeatChooser presentation="sheet" />);
    await type('Marrickville');
    expect(one(r, 'seat-no-results').props.children).toBe(
      'No matching electorate or member.',
    );
    expect(one(r, 'seat-no-results-help').props.children).toBe(
      'Suburbs and postcodes can’t be looked up yet. Use your location, or check your address with the AEC to find your electorate’s name.',
    );
    for (const id of ['use-my-location', 'seat-browse-nsw', 'seat-aec'])
      expect(byID(r, id)).not.toHaveLength(0);
    // The sheet closes with Cancel: no "Choose later" there.
    expect(byID(r, 'seat-choose-later')).toHaveLength(0);
    await act(async () => r.unmount());
  });
  test('from a miss, location resolving to one seat is one row to tap', async () => {
    jest.useFakeTimers();
    (suggestFromLocation as jest.Mock).mockResolvedValue({
      kind: 'suggested',
      seat: grayndler,
      vintage: '2025 election',
    });
    const r = await render(<SeatChooser presentation="welcome" />);
    await type('2042');
    await act(async () => one(r, 'use-my-location').props.onPress());
    const row = one(r, 'seat-location-row');
    expect(row.props.meta).toBe('From your location');
    await act(async () => row.props.onPress());
    expect(choose).toHaveBeenCalledWith(grayndler);
    await act(async () => jest.advanceTimersByTime(CHOSEN_MARK_MS));
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: false });
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    expect(reports()).toEqual([
      [
        'opax_first_run',
        { step: 'seat', outcome: 'chosen', method: 'location' },
      ],
    ]);
    await act(async () => r.unmount());
  });
  test('from a miss, location near a boundary lists each seat, and none is chosen for the reader', async () => {
    (suggestFromLocation as jest.Mock).mockResolvedValue({
      kind: 'border',
      seats: [grayndler, sydney],
      vintage: '2025 election',
    });
    const r = await render(<SeatChooser presentation="welcome" />);
    await type('2042');
    await act(async () => one(r, 'use-my-location').props.onPress());
    expect(byID(r, 'location-border')).not.toHaveLength(0);
    for (const seat of [grayndler, sydney]) {
      const row = one(r, `seat-location-row-${seat.slug}`);
      expect(row.props.meta).toBe('Near your location');
      expect(row.props.accessory).toBe('chevron');
    }
    expect(choose).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
  test('from a miss, location finding no seat says so and keeps every other way on', async () => {
    (suggestFromLocation as jest.Mock).mockResolvedValue({ kind: 'no-match' });
    const r = await render(<SeatChooser presentation="welcome" />);
    await type('2042');
    await act(async () => one(r, 'use-my-location').props.onPress());
    expect(byID(r, 'location-no-match')).not.toHaveLength(0);
    for (const id of [
      'use-my-location',
      'seat-browse-nsw',
      'seat-aec',
      'seat-choose-later',
    ])
      expect(byID(r, id)).not.toHaveLength(0);
    await act(async () => r.unmount());
  });
  test('a miss never starts location by itself, even on a locate=1 arrival', async () => {
    (suggestFromLocation as jest.Mock).mockResolvedValue({ kind: 'denied' });
    const r = await render(<SeatChooser presentation="sheet" locate />);
    expect(suggestFromLocation).toHaveBeenCalledTimes(1);
    await type('2042');
    expect(byID(r, 'use-my-location')).not.toHaveLength(0);
    expect(suggestFromLocation).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
});

describe('location refused', () => {
  test('refused in the welcome: Open Settings, and search, Browse and "Choose later" all still work', async () => {
    (suggestFromLocation as jest.Mock).mockResolvedValue({ kind: 'denied' });
    const r = await render(<SeatChooser presentation="welcome" />);
    await act(async () => one(r, 'use-my-location').props.onPress());
    expect(byID(r, 'location-denied')).not.toHaveLength(0);
    expect(words(r)).toContain('Location access is off for OPAX.');
    expect(byID(r, 'seat-location-settings')).not.toHaveLength(0);
    // The row stays, so a reader who changes their mind can try again.
    expect(one(r, 'use-my-location').props.disabled).toBe(false);
    for (const id of ['seat-browse-nsw', 'seat-aec', 'seat-choose-later'])
      expect(byID(r, id)).not.toHaveLength(0);
    expect(one(r, 'seat-choose-later').props.disabled).toBe(false);
    // Search still answers.
    await type('Grayndler');
    expect(byID(r, `seat-row-${grayndler.slug}`)).not.toHaveLength(0);
    // A refusal is not reported: only a choice or a skip is.
    expect(reports()).toEqual([]);
    await act(async () => r.unmount());
  });
  test('location that cannot be found says so without blame and keeps the row', async () => {
    (suggestFromLocation as jest.Mock).mockRejectedValue(new Error('gps'));
    const r = await render(<SeatChooser presentation="welcome" />);
    await act(async () => one(r, 'use-my-location').props.onPress());
    expect(byID(r, 'location-unavailable')).not.toHaveLength(0);
    expect(words(r)).toContain(
      'Your location couldn’t be found. Search by name instead.',
    );
    expect(byID(r, 'use-my-location')).not.toHaveLength(0);
    expect(byID(r, 'seat-choose-later')).not.toHaveLength(0);
    await act(async () => r.unmount());
  });
});

describe('Browse by state in the welcome', () => {
  test('"Not now" in the bar: the list is not a dead end', async () => {
    const r = await render(<SeatStateList code="nsw" presentation="welcome" />);
    const [notNow] = mockScreen.options.unstable_headerRightItems();
    expect(notNow.label).toBe('Not now');
    expect(notNow.accessibilityLabel).toBe('Not now');
    act(() => notNow.onPress());
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: true });
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    expect(reports()).toEqual([
      ['opax_first_run', { step: 'state', outcome: 'skipped' }],
    ]);
    await act(async () => r.unmount());
  });
  test('after the seats: the AEC finder and "Choose later"', async () => {
    const r = await render(<SeatStateList code="nsw" presentation="welcome" />);
    const ids = r.root
      .findAll(
        (n) =>
          typeof n.type !== 'string' &&
          ['seat-state-list', 'seat-aec', 'seat-choose-later'].includes(
            n.props.testID,
          ),
      )
      .map((n) => n.props.testID as string);
    expect([...new Set(ids)]).toEqual([
      'seat-state-list',
      'seat-aec',
      'seat-choose-later',
    ]);
    act(() => one(r, 'seat-choose-later').props.onPress());
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: true });
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
  test('choosing from the list is a choice by browsing, and declines nothing', async () => {
    jest.useFakeTimers();
    const r = await render(<SeatStateList code="nsw" presentation="welcome" />);
    await act(async () => one(r, `seat-row-${grayndler.slug}`).props.onPress());
    await act(async () => jest.advanceTimersByTime(CHOSEN_MARK_MS));
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: false });
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    expect(reports()).toEqual([
      [
        'opax_first_run',
        { step: 'state', outcome: 'chosen', method: 'browse' },
      ],
    ]);
    await act(async () => r.unmount());
  });
  test('a postcode in the state’s field is answered plainly, with the AEC finder', async () => {
    const r = await render(<SeatStateList code="nsw" presentation="welcome" />);
    await type('2042');
    expect(one(r, 'seat-no-results').props.children).toBe(
      'OPAX can’t look up postcodes yet.',
    );
    // No location row on this screen, so the line does not point at one.
    expect(one(r, 'seat-no-results-help').props.children).toBe(
      'Check your address with the AEC to find your electorate’s name.',
    );
    expect(byID(r, 'seat-aec')).not.toHaveLength(0);
    expect(byID(r, 'seat-choose-later')).not.toHaveLength(0);
    await act(async () => r.unmount());
  });
  test('a replay with a seat saved: Done, no "Choose later", nothing declined', async () => {
    mockSeat.current = saved();
    const r = await render(<SeatStateList code="nsw" presentation="welcome" />);
    const [done] = mockScreen.options.unstable_headerRightItems();
    expect(done.label).toBe('Done');
    expect(byID(r, 'seat-choose-later')).toHaveLength(0);
    act(() => done.onPress());
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: false });
    expect(reports()).toEqual([]);
    await act(async () => r.unmount());
  });
  test('in the sheet the list keeps its back button only: no bar item, no "Choose later", no report', async () => {
    jest.useFakeTimers();
    const r = await render(<SeatStateList code="nsw" presentation="sheet" />);
    expect(mockScreen.options.unstable_headerRightItems).toBeUndefined();
    expect(byID(r, 'seat-choose-later')).toHaveLength(0);
    expect(byID(r, 'seat-aec')).not.toHaveLength(0);
    await act(async () => one(r, `seat-row-${grayndler.slug}`).props.onPress());
    await act(async () => jest.advanceTimersByTime(CHOSEN_MARK_MS));
    expect(markWelcomeSeen).not.toHaveBeenCalled();
    expect(reports()).toEqual([]);
    await act(async () => r.unmount());
  });
});

describe('what the funnel hears', () => {
  test('a choice by name is reported as "search", and no report carries a seat, a state or typed text', async () => {
    jest.useFakeTimers();
    const r = await render(<SeatChooser presentation="welcome" />);
    await type('Grayndler');
    await act(async () => one(r, `seat-row-${grayndler.slug}`).props.onPress());
    await act(async () => jest.advanceTimersByTime(CHOSEN_MARK_MS));
    expect(reports()).toEqual([
      ['opax_first_run', { step: 'seat', outcome: 'chosen', method: 'search' }],
    ]);
    const sent = JSON.stringify(reports()).toLowerCase();
    for (const personal of [
      'grayndler',
      grayndler.slug,
      grayndler.electorate_id,
      'nsw',
      'albanese',
    ])
      expect(sent).not.toContain(personal.toLowerCase());
    await act(async () => r.unmount());
  });
  test('the sheet reports nothing when a seat is chosen', async () => {
    jest.useFakeTimers();
    const r = await render(<SeatChooser presentation="sheet" />);
    await type('Grayndler');
    await act(async () => one(r, `seat-row-${grayndler.slug}`).props.onPress());
    await act(async () => jest.advanceTimersByTime(CHOSEN_MARK_MS));
    expect(reports()).toEqual([]);
    await act(async () => r.unmount());
  });
});
