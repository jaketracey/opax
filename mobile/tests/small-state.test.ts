import { loadChoice, saveChoice } from '../src/features/your-mp/choice-store';
import { markTourSeen, tourSeen } from '../src/onboarding/state';
import { readCopies } from '../src/storage/two-slot';
import type { SeatChoice } from '../src/features/your-mp/model';

const mockDisk = new Map<string, string>();
let mockInterrupt: 'before' | 'missing' | 'torn' | 'after' | null = null;
const mockWrites: string[] = [];
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
      mockWrites.push(this.name);
      if (mockInterrupt === 'before') throw new Error('interrupted');
      if (mockInterrupt === 'missing') {
        mockDisk.delete(this.name);
        throw new Error('interrupted');
      }
      if (mockInterrupt === 'torn') {
        mockDisk.set(this.name, body.slice(0, body.length / 2));
        throw new Error('interrupted');
      }
      mockDisk.set(this.name, body);
      if (mockInterrupt === 'after') throw new Error('interrupted');
    }
    // Model Expo's destructive overwrite move: these stores must not use it.
    move(to: { name: string }) {
      mockDisk.delete(to.name);
      throw new Error('unsafe overwrite move');
    }
  },
}));
const A: SeatChoice = {
  version: 1,
  seatId: 'el_5d600e7f6dca5b72ae04d686',
  stateSeatIds: [],
};
const B: SeatChoice = { ...A, stateSeatIds: [A.seatId] };
beforeEach(() => {
  mockDisk.clear();
  mockWrites.length = 0;
  mockInterrupt = null;
});

test.each(['before', 'missing', 'torn', 'after'] as const)(
  'seat save interrupted %s preserves a whole choice on the next launch',
  async (step) => {
    await saveChoice(B);
    await saveChoice(A);
    const good = mockDisk.get('opax-seat-v1.b.json');
    mockInterrupt = step;
    await expect(saveChoice(B)).rejects.toThrow('interrupted');
    expect(mockDisk.get('opax-seat-v1.b.json')).toBe(good);
    // loadChoice always reads disk, just as a new process would.
    expect(await loadChoice()).toEqual(step === 'after' ? B : A);
    mockInterrupt = null;
    await saveChoice(B);
    expect(await loadChoice()).toEqual(B);
  },
);
test.each(['before', 'missing', 'torn', 'after'] as const)(
  'tour save interrupted %s never loses its last completed seen flag',
  async (step) => {
    await markTourSeen();
    await markTourSeen();
    const good = mockDisk.get('opax-welcome-v1.b.json');
    mockInterrupt = step;
    await expect(markTourSeen()).rejects.toThrow('interrupted');
    expect(mockDisk.get('opax-welcome-v1.b.json')).toBe(good);
    expect(await tourSeen()).toBe(true);
    mockInterrupt = null;
    await markTourSeen();
    expect(await tourSeen()).toBe(true);
  },
);
test('legacy seat is readable and survives a torn first numbered save', async () => {
  mockDisk.set('opax-seat-v1.json', JSON.stringify(A));
  expect(await loadChoice()).toEqual(A);
  mockInterrupt = 'torn';
  await expect(saveChoice(B)).rejects.toThrow();
  expect(await loadChoice()).toEqual(A);
  expect(mockDisk.get('opax-seat-v1.json')).toBe(JSON.stringify(A));
});
test('legacy tour version is readable; its first upgrade preserves the old slot', async () => {
  mockDisk.set('opax-welcome-v1.json', JSON.stringify({ version: 0 }));
  expect(await tourSeen()).toBe(false);
  mockInterrupt = 'torn';
  await expect(markTourSeen()).rejects.toThrow();
  expect(await tourSeen()).toBe(false);
  mockInterrupt = null;
  await markTourSeen();
  expect(await tourSeen()).toBe(true);
  expect(mockDisk.get('opax-welcome-v1.json')).toBe('{"version":0}');
});
test('concurrent seat saves are ordered and the last complete choice wins', async () => {
  await Promise.all([saveChoice(A), saveChoice(B), saveChoice(A)]);
  expect(await loadChoice()).toEqual(A);
  expect(mockWrites).toEqual([
    'opax-seat-v1.json',
    'opax-seat-v1.b.json',
    'opax-seat-v1.json',
  ]);
  expect(JSON.parse(mockDisk.get('opax-seat-v1.json')!).generation).toBe(3);
});
test('a valid but wrong seat schema and invalid counter cannot replace a good slot', async () => {
  await saveChoice(A);
  await saveChoice(B);
  for (const bad of [
    { ...A, version: 2, generation: 3 },
    { ...A, generation: -1 },
  ]) {
    mockDisk.set('opax-seat-v1.json', JSON.stringify(bad));
    expect(await loadChoice()).toEqual(B);
  }
});
test('unreadable primary does not hide a readable older-version tour slot', async () => {
  mockDisk.set('opax-welcome-v1.json', '{torn');
  mockDisk.set('opax-welcome-v1.b.json', '{"version":0,"generation":2}');
  expect(await tourSeen()).toBe(false);
  const freshRead = await readCopies(
    ['opax-welcome-v1.json', 'opax-welcome-v1.b.json'],
    (v) => (v && typeof v === 'object' ? v : null),
  );
  expect(freshRead).toMatchObject({ slot: 1, generation: 2 });
});
