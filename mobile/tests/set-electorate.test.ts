import { act, createElement, useEffect } from 'react';
import TestRenderer from 'react-test-renderer';
import { Alert, ActionSheetIOS, Platform } from 'react-native';
import { catalogs } from '../src/api/runtime';
import { haptic } from '../src/design/haptics';
import {
  useSetAsMyElectorate,
  type SetAsMyElectorate,
} from '../src/features/your-mp/useSetAsMyElectorate';
import { resetSeatForTests } from '../src/features/your-mp/useSeat';
import { loadChoice, saveChoice } from '../src/features/your-mp/choice-store';
import { catalogs as pinned, index } from './pinned';
import type { Directory } from '../src/features/your-mp/model';
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
const seat = (name: string) =>
  index.electorates.find(
    (s) =>
      s.name === name &&
      s.jurisdiction === 'federal' &&
      s.chamber === 'representatives',
  )!;
const grayndler = seat('Grayndler'),
  sydney = seat('Sydney');
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
let hook: SetAsMyElectorate;
function Consumer() {
  const value = useSetAsMyElectorate(sydney);
  useEffect(() => {
    hook = value;
  }, [value]);
  return null;
}
let renderer: TestRenderer.ReactTestRenderer | null = null;
let alert: jest.SpyInstance, sheet: jest.SpyInstance;
beforeEach(() => {
  mockDisk.clear();
  mockFail = false;
  resetSeatForTests();
  jest.mocked(catalogs.directory).mockResolvedValue(directory);
  jest.mocked(haptic).mockClear();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  sheet = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => undefined);
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  resetSeatForTests();
  jest.restoreAllMocks();
});
async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(createElement(Consumer));
  });
}

test('no saved seat saves at once, with success haptic and the ready-to-use label', async () => {
  await mount();
  expect(hook.visible).toBe(true);
  expect(hook.label).toBe('Set Sydney as my electorate');
  await act(async () => hook.run());
  expect((await loadChoice())?.seatId).toBe(sydney.electorate_id);
  expect(haptic).toHaveBeenCalledTimes(1);
  expect(haptic).toHaveBeenCalledWith('success');
  expect(sheet).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
});
test('a different saved seat asks Replace and Cancel; cancellation keeps the old seat', async () => {
  await saveChoice({
    version: 1,
    seatId: grayndler.electorate_id,
    stateSeatIds: [],
  });
  await mount();
  await act(async () => hook.run());
  expect(sheet).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'Replace Grayndler with Sydney?',
      options: ['Replace', 'Cancel'],
      cancelButtonIndex: 1,
    }),
    expect.any(Function),
  );
  await act(async () => sheet.mock.calls[0]![1](1));
  expect((await loadChoice())?.seatId).toBe(grayndler.electorate_id);
  expect(haptic).not.toHaveBeenCalled();
  await act(async () => hook.run());
  await act(async () => {
    sheet.mock.calls[1]![1](0);
  });
  expect((await loadChoice())?.seatId).toBe(sydney.electorate_id);
  expect(haptic).toHaveBeenCalledWith('success');
});
test('this seat hides the menu item and a stale action cannot write', async () => {
  await saveChoice({
    version: 1,
    seatId: sydney.electorate_id,
    stateSeatIds: [],
  });
  await mount();
  expect(hook.visible).toBe(false);
  const bytes = [...mockDisk];
  await act(async () => hook.run());
  expect([...mockDisk]).toEqual(bytes);
  expect(sheet).not.toHaveBeenCalled();
  expect(haptic).not.toHaveBeenCalled();
});
test('failed save alerts with Try again and Cancel, keeps the previous choice, and retry saves', async () => {
  await saveChoice({
    version: 1,
    seatId: grayndler.electorate_id,
    stateSeatIds: [],
  });
  await mount();
  mockFail = true;
  await act(async () => hook.run());
  await act(async () => {
    sheet.mock.calls[0]![1](0);
  });
  expect(alert).toHaveBeenCalledWith(
    'Your electorate couldn’t be saved on this iPhone.',
    undefined,
    expect.arrayContaining([
      expect.objectContaining({ text: 'Try again' }),
      expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
    ]),
  );
  expect((await loadChoice())?.seatId).toBe(grayndler.electorate_id);
  expect(haptic).not.toHaveBeenCalled();
  expect(hook.visible).toBe(true);
  mockFail = false;
  await act(async () => {
    alert.mock.calls[0]![2][0].onPress();
  });
  expect((await loadChoice())?.seatId).toBe(sydney.electorate_id);
  expect(hook.visible).toBe(false);
});
