import {
  createRecentStore,
  type RecentSearch,
} from '../src/features/search/recent';

test.each(['clear', 'remove'] as const)(
  '%s during the first disk read stays deleted in memory and on disk',
  async (action) => {
    let resolve!: (items: RecentSearch[]) => void;
    const disk = {
      read: () =>
        new Promise<RecentSearch[]>((done) => {
          resolve = done;
        }),
      save: jest.fn(async () => undefined),
    };
    const store = createRecentStore(disk, () => 3);
    const loading = store.load();
    if (action === 'clear') store.clear();
    else store.remove('HOUSING');
    store.add('health', 'speeches');
    resolve([
      { q: 'housing', scope: 'all', at: 2 },
      { q: 'education', scope: 'bills', at: 1 },
    ]);
    await loading;
    expect(store.snapshot().items.map((item) => item.q)).toEqual(
      action === 'clear' ? ['health'] : ['health', 'education'],
    );
    expect(disk.save).toHaveBeenLastCalledWith(store.snapshot().items);
  },
);
