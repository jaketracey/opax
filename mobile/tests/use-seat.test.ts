import { act, useEffect, createElement, Fragment } from 'react';
import TestRenderer from 'react-test-renderer';
import { catalogs } from '../src/api/runtime';
import { loadChoice, saveChoice } from '../src/features/your-mp/choice-store';
import {
  migrateSeatChoice,
  resetSeatForTests,
  useSeat,
  type SeatActions,
  type SeatState,
} from '../src/features/your-mp/useSeat';
import { useIsMyMember } from '../src/features/your-mp/useIsMyMember';
import { haptic } from '../src/design/haptics';
import { catalogs as pinned, index } from './pinned';
import type { Directory, SeatChoice } from '../src/features/your-mp/model';
import type { Electorate } from '../src/api/catalogs';
const result = <T>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  etag: null,
  asOf: null,
});
const directory: Directory = {
  manifest: result(pinned.manifest),
  roster: result(pinned.roster),
  slugs: result(pinned.slugs),
  people: result(pinned.people),
  electorates: result(index),
};
const mockDisk = new Map<string, string>();
let mockFail = false;
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    name: string;
    constructor(_directory: unknown, name: string) {
      this.name = name;
    }
    get exists() {
      return mockDisk.has(this.name);
    }
    async text() {
      return mockDisk.get(this.name)!;
    }
    write(body: string) {
      if (mockFail) throw new Error('unwritable');
      mockDisk.set(this.name, body);
    }
  },
}));
jest.mock('../src/api/runtime', () => ({ catalogs: { directory: jest.fn() } }));
jest.mock('../src/design/haptics', () => ({ haptic: jest.fn() }));
let value: SeatState & SeatActions;
let own = false;
function Consumer() {
  const next = useSeat();
  const member = useIsMyMember('anthony-albanese');
  useEffect(() => {
    value = next;
    own = member;
  }, [next, member]);
  return null;
}
const seats = directory.electorates.data.electorates;
const seat = (name: string) =>
  seats.find(
    (s) =>
      s.name === name &&
      s.jurisdiction === 'federal' &&
      s.chamber === 'representatives',
  )!;
const stateSeat = seats.find(
  (s) => s.jurisdiction === 'vic' && s.name === 'Wendouree',
)!;
let renderer: TestRenderer.ReactTestRenderer | null = null;
beforeEach(() => {
  mockDisk.clear();
  mockFail = false;
  resetSeatForTests();
  jest.mocked(catalogs.directory).mockReset().mockResolvedValue(directory);
  jest.mocked(haptic).mockClear();
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  resetSeatForTests();
});
async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(createElement(Consumer));
  });
}
const choice = (s: Electorate, stateSeatIds: string[] = []): SeatChoice => ({
  version: 1,
  seatId: s.electorate_id,
  stateSeatIds,
});

test('all hook users redraw after one local choice without refetching the directory', async () => {
  const observed: string[] = [];
  function Second() {
    const s = useSeat();
    observed.push(s.status === 'chosen' ? s.choice.seatId : s.status);
    return null;
  }
  await act(async () => {
    renderer = TestRenderer.create(
      createElement(
        Fragment,
        null,
        createElement(Consumer),
        createElement(Second),
      ),
    );
  });
  expect(value.status).toBe('none');
  await act(async () => value.choose(seat('Grayndler')));
  expect(value).toMatchObject({
    status: 'chosen',
    choice: choice(seat('Grayndler')),
  });
  expect(observed.at(-1)).toBe(seat('Grayndler').electorate_id);
  expect(catalogs.directory).toHaveBeenCalledTimes(1);
  expect(haptic).toHaveBeenCalledWith('success');
  expect(own).toBe(true);
  await act(async () => value.choose(seat('Sydney')));
  expect(own).toBe(false);
  expect(catalogs.directory).toHaveBeenCalledTimes(1);
  expect(await loadChoice()).toEqual(choice(seat('Sydney')));
});
test('Victoria to Victoria keeps state choices; leaving Victoria clears them in the same save', async () => {
  await saveChoice(choice(seat('Melbourne'), [stateSeat.electorate_id]));
  await mount();
  await act(async () => value.choose(seat('Ballarat')));
  expect(await loadChoice()).toEqual(
    choice(seat('Ballarat'), [stateSeat.electorate_id]),
  );
  await act(async () => value.choose(seat('Grayndler')));
  expect(await loadChoice()).toEqual(choice(seat('Grayndler')));
});
test('state choice and its region save together, removeState clears state ids', async () => {
  await saveChoice(choice(seat('Melbourne')));
  await mount();
  const region = seats.find(
    (s) => s.jurisdiction === 'vic' && s.name === 'Northern Metropolitan',
  )!;
  await act(async () => value.chooseState(stateSeat, region));
  expect((await loadChoice())?.stateSeatIds).toEqual([
    stateSeat.electorate_id,
    region.electorate_id,
  ]);
  await act(async () => value.removeState());
  expect((await loadChoice())?.stateSeatIds).toEqual([]);
});
test('migration table preserves abolished seats, clears non-Victorian state ids and moves state-only choices', () => {
  const federal = seat('Grayndler');
  expect(migrateSeatChoice(choice(federal), seats)).toEqual(choice(federal));
  expect(
    migrateSeatChoice(choice(federal, [stateSeat.electorate_id]), seats),
  ).toEqual(choice(federal));
  const abolished = { ...federal, status: 'historical' };
  expect(migrateSeatChoice(choice(abolished), [abolished])).toEqual(
    choice(abolished),
  );
  const senate = { ...federal, chamber: 'senate' };
  expect(migrateSeatChoice(choice(senate), [senate])).toBeNull();
  expect(migrateSeatChoice(choice(stateSeat), seats)).toEqual({
    version: 1,
    seatId: '',
    stateSeatIds: [stateSeat.electorate_id],
  });
  const other = { ...stateSeat, jurisdiction: 'nsw' };
  expect(migrateSeatChoice(choice(other), [other])).toBeNull();
});
test('read migration never writes legacy bytes, and the next choice uses the migrated state ids', async () => {
  const bytes = JSON.stringify(
    choice(seat('Grayndler'), [stateSeat.electorate_id]),
  );
  mockDisk.set('opax-seat-v1.json', bytes);
  await mount();
  expect(value).toMatchObject({
    status: 'chosen',
    choice: choice(seat('Grayndler')),
  });
  expect(mockDisk.get('opax-seat-v1.json')).toBe(bytes);
  expect(mockDisk.size).toBe(1);
});
test('a failed save changes no consumer and gives no haptic', async () => {
  await mount();
  mockFail = true;
  await act(async () => {
    await expect(value.choose(seat('Grayndler'))).rejects.toThrow('unwritable');
  });
  expect(value.status).toBe('none');
  expect(haptic).not.toHaveBeenCalled();
});
test('directory failure produces the typed error state', async () => {
  jest.mocked(catalogs.directory).mockRejectedValue(new Error('offline'));
  await mount();
  expect(value.status).toBe('error');
});

test('a migrated Victorian district survives the next Victorian federal choice', async () => {
  mockDisk.set('opax-seat-v1.json', JSON.stringify(choice(stateSeat)));
  await mount();
  expect(value).toMatchObject({
    status: 'chosen',
    choice: { seatId: '', stateSeatIds: [stateSeat.electorate_id] },
  });
  await act(async () => value.choose(seat('Melbourne')));
  expect(await loadChoice()).toEqual(
    choice(seat('Melbourne'), [stateSeat.electorate_id]),
  );
});
test('removing a state-only migrated choice restores the invitation across a read', async () => {
  mockDisk.set('opax-seat-v1.json', JSON.stringify(choice(stateSeat)));
  await mount();
  await act(async () => value.removeState());
  expect(value.status).toBe('none');
  const saved = await loadChoice();
  expect(saved?.stateSeatIds).toEqual([]);
  expect(migrateSeatChoice(saved!, seats)).toBeNull();
});
