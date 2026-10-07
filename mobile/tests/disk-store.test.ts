import { DiskStore } from '../src/api/disk-store';
import { Paths } from 'expo-file-system';

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
