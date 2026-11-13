import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import { Catalogs } from '../src/api/catalogs';
import type { ApiClient, RecordResult } from '../src/api/client';
import { dataAsOf } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import { StatStrip } from '../src/design/record';
import Person from '../src/features/Person';
import {
  forgetProfiles,
  rememberedProfile,
  rememberProfile,
  sameRecord,
} from '../src/features/people/profile-memo';
import { pinned, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  apiClient: { get: jest.fn() },
  catalogs: {
    person: jest.fn(),
    profileFor: jest.fn(),
    directory: jest.fn(),
  },
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  ...jest.requireActual('../src/features/your-mp/useSeat'),
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
const mockParams: { slug?: string } = {};
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Link: Object.assign(
    ({ children, ...props }: { children: unknown }) =>
      jest
        .requireActual('react')
        .createElement(
          jest.requireActual('react-native').Pressable,
          props,
          children,
        ),
    {
      Trigger: ({ children }: { children: unknown }) => children,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    },
  ),
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), navigate: jest.fn() },
  Stack: { Screen: () => null },
}));
const client: Pick<ApiClient, 'get'> = {
  async get<T>(
    path: string,
    decode: (input: unknown) => T,
  ): Promise<RecordResult<T>> {
    const raw = path === '/api/person-slugs' ? slugs : pinned(path);
    return {
      data: decode(raw),
      asOf: dataAsOf(raw),
      stale: false,
      savedAt: 200,
    };
  },
};
const fixture = new Catalogs(client);
const mock = jest.mocked(runtime);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
type PersonRead = Awaited<ReturnType<Catalogs['person']>>;
type Profile = Awaited<ReturnType<Catalogs['profileFor']>>;
let person: PersonRead;
let profile: Profile;
beforeAll(async () => {
  person = await fixture.person('anthony-albanese');
  profile = await fixture.profileFor(person.data.canonicalPersonId!);
});
beforeEach(() => {
  Object.values(mock).forEach((fn) => fn.mockReset());
  mockParams.slug = 'anthony-albanese';
  mock.directory.mockImplementation(() => fixture.directory());
});

async function open() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Person />);
  });
  return r;
}
const drawn = (r: TestRenderer.ReactTestRenderer) => ({
  skeleton: r.root.findAllByProps({ testID: 'person-pending-screen' }).length,
  content: r.root.findAllByProps({ testID: 'person-screen' }).length,
});

describe('opening a profile again (PF4)', () => {
  test('a first open draws the skeleton until the read answers', async () => {
    const read = deferred<PersonRead>();
    mock.person.mockReturnValueOnce(read.promise);
    mock.profileFor.mockResolvedValue(profile);
    const r = await open();
    expect(drawn(r).skeleton).toBeGreaterThan(0);
    expect(drawn(r).content).toBe(0);
    await act(async () => read.resolve(person));
    expect(drawn(r).skeleton).toBe(0);
    expect(drawn(r).content).toBeGreaterThan(0);
    expect(rememberedProfile('anthony-albanese')).toBeDefined();
  });

  test('a repeat open draws the profile on its first frame, then keeps it when the read matches', async () => {
    mock.person.mockResolvedValueOnce(person);
    mock.profileFor.mockResolvedValue(profile);
    const first = await open();
    await act(async () => first.unmount());
    // The second open's read has not answered: no skeleton, the page is up.
    const read = deferred<PersonRead>();
    mock.person.mockReturnValueOnce(read.promise);
    const r = await open();
    expect(drawn(r).skeleton).toBe(0);
    expect(drawn(r).content).toBeGreaterThan(0);
    expect(mock.person).toHaveBeenCalledTimes(2);
    const tiles = r.root.findByType(StatStrip).props.tiles;
    // The read answers the same record, as new objects: no redraw.
    mock.profileFor.mockResolvedValue(
      await fixture.profileFor(person.data.canonicalPersonId!),
    );
    await act(async () => read.resolve(person));
    expect(r.root.findByType(StatStrip).props.tiles).toBe(tiles);
  });

  test('a changed record redraws the remembered page', async () => {
    mock.person.mockResolvedValue(person);
    mock.profileFor.mockResolvedValueOnce(profile);
    const first = await open();
    await act(async () => first.unmount());
    const pay = profile.blocks.pay;
    const changed = {
      ...profile,
      blocks: {
        ...profile.blocks,
        pay: { ...pay, stale: true, savedAt: (pay.savedAt ?? 0) - 1 },
      },
    } as Profile;
    const read = deferred<Profile>();
    mock.profileFor.mockReturnValueOnce(read.promise);
    const r = await open();
    const tiles = r.root.findByType(StatStrip).props.tiles;
    await act(async () => read.resolve(changed));
    expect(r.root.findByType(StatStrip).props.tiles).not.toBe(tiles);
    expect(rememberedProfile('anthony-albanese')!.profile).toBe(changed);
  });

  test('a person no longer found is forgotten, and the next open loads afresh', async () => {
    mock.person.mockResolvedValueOnce(person);
    mock.profileFor.mockResolvedValue(profile);
    const first = await open();
    expect(rememberedProfile('anthony-albanese')).toBeDefined();
    await act(async () => first.unmount());
    mock.person.mockRejectedValueOnce(
      new ApiError('not-found', 'Not in the directory.'),
    );
    const gone = await open();
    expect(
      gone.root.findAllByProps({ testID: 'person-pending-screen' }).length,
    ).toBeGreaterThan(0);
    expect(rememberedProfile('anthony-albanese')).toBeUndefined();
    await act(async () => gone.unmount());
    mock.person.mockReturnValueOnce(new Promise(() => {}));
    const r = await open();
    expect(drawn(r).content).toBe(0);
  });

  test('a failed read keeps the remembered page', async () => {
    mock.person.mockResolvedValueOnce(person);
    mock.profileFor.mockResolvedValue(profile);
    const first = await open();
    expect(rememberedProfile('anthony-albanese')).toBeDefined();
    await act(async () => first.unmount());
    mock.person.mockRejectedValueOnce(new ApiError('offline', 'Offline.'));
    const r = await open();
    expect(drawn(r).content).toBeGreaterThan(0);
    expect(r.root.findAllByProps({ testID: 'person-error' })).toHaveLength(0);
    expect(rememberedProfile('anthony-albanese')).toBeDefined();
  });
});

describe('the session memo', () => {
  test('holds at most eight profiles, dropping the least recently read', () => {
    const loaded = { profile, official: null, seat: null };
    for (let i = 0; i < 9; i++) rememberProfile(`p${i}`, loaded);
    expect(rememberedProfile('p0')).toBeUndefined();
    expect(rememberedProfile('p8')).toBe(loaded);
    rememberProfile('p1', loaded);
    rememberProfile('p9', loaded);
    expect(rememberedProfile('p1')).toBe(loaded);
    expect(rememberedProfile('p2')).toBeUndefined();
    forgetProfiles();
    expect(rememberedProfile('p1')).toBeUndefined();
  });

  test.each([
    [{ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] }, true],
    [{ a: [1, { b: 'x' }] }, { a: [1, { b: 'y' }] }, false],
    [{ a: 1 }, { a: 1, b: undefined }, false],
    [[1, 2], [1, 2, 3], false],
    [null, {}, false],
    [new Map([[1, 2]]), new Map([[1, 3]]), false],
    [new Map([[1, { a: 2 }]]), new Map([[1, { a: 2 }]]), true],
    [
      new Map([
        [1, 2],
        [3, 4],
      ]),
      new Map([
        [3, 4],
        [1, 2],
      ]),
      false,
    ],
    [new Map([[1, 2]]), new Set([[1, 2]]), false],
    [new Set(['a']), new Set(['a']), true],
    [new Map(), {}, false],
    [new ApiError('offline', 'a'), new ApiError('offline', 'a'), true],
    [new ApiError('offline', 'a'), new ApiError('offline', 'b'), false],
    [new ApiError('offline', 'a'), new ApiError('timeout', 'a'), false],
  ])('sameRecord(%p, %p) is %p', (a, b, same) => {
    expect(sameRecord(a, b)).toBe(same);
  });

  test('two reads of the same record are the same', async () => {
    const again = await fixture.profileFor(person.data.canonicalPersonId!);
    expect(again).not.toBe(profile);
    expect(sameRecord(again, profile)).toBe(true);
  });
});
