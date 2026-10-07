import { DiskStore } from '../src/api/disk-store';
import { Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const mockWrite = jest.fn();
const mockMove = jest.fn();
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache', availableDiskSpace: 10 * 1024 * 1024 },
  Directory: class {
    exists = false;
    create() {}
  },
  File: class {
    name = 'index.json';
    exists = false;
    write = mockWrite;
    move = mockMove;
  },
}));

test('low storage preserves device space instead of saving an offline copy', async () => {
  (Paths as unknown as { availableDiskSpace: number }).availableDiskSpace = 0;
  await expect(new DiskStore().writeIndex([])).rejects.toThrow(
    'device storage',
  );
  expect(mockWrite).not.toHaveBeenCalled();
  expect(mockMove).not.toHaveBeenCalled();
});

test('with space available a temporary offline copy replaces the destination', async () => {
  (Paths as unknown as { availableDiskSpace: number }).availableDiskSpace =
    10 * 1024 * 1024;
  await new DiskStore().writeIndex([]);
  expect(mockWrite).toHaveBeenCalledWith('[]');
  expect(mockMove).toHaveBeenCalledTimes(1);
});

test('Android publishes a cached record only after its native move completes', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: 'android',
  });
  let complete!: () => void;
  mockMove.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  let published = false;
  try {
    const pending = new DiskStore().writeIndex([]).then(() => {
      published = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(complete).toBeDefined();
    expect(published).toBe(false);
    complete();
    await pending;
    expect(published).toBe(true);
  } finally {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: original,
    });
  }
});
