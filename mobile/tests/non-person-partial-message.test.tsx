import { act, type ReactElement } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Catalogs } from '../src/api/catalogs';
import { decodeElectorate } from '../src/api/catalog-decoders';
import { isPartialCatalog } from '../src/api/validation';
import { RecordBlock } from '../src/features/your-mp/Evidence';
import { files, manifest, pinned, replaceAt, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
beforeEach(() =>
  jest.spyOn(console, 'warn').mockImplementation(() => undefined),
);
afterEach(() => jest.restoreAllMocks());

// Keep the real catalog loader and its per-file flag, as in the reviewer's repros.
const api = (overrides: Record<string, unknown>) =>
  new Catalogs({
    get: async <T,>(path: string, decoder: (value: unknown) => T) => {
      const data = decoder(
        path in overrides
          ? overrides[path]
          : path === '/api/person-slugs'
            ? slugs
            : pinned(path),
      );
      return {
        data,
        ...(isPartialCatalog(data) ? { partial: true } : {}),
        stale: false,
        savedAt: 1000,
        asOf: null,
      };
    },
  } as never);

const words = (element: ReactElement) => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  const text = renderer.root
    .findAllByType(NativeText)
    .map((n) => [n.props.children].flat(3).join(''))
    .join(' ');
  act(() => renderer.unmount());
  return text;
};

test('Electorate: partial Higgins keeps the abolished-seat message', async () => {
  const path = Object.keys(files)
    .filter((p) => /\/el_[a-f0-9]{24}\.json$/.test(p))
    .find((p) => decodeElectorate(pinned(p)).name === 'Higgins')!;
  expect(path).toBeDefined();
  const raw = pinned(path) as {
    status: string;
    boundaries: unknown[];
  };
  expect(raw.status).toBe('historical');
  const bad = {
    ...raw,
    boundaries: [...raw.boundaries, { electorate_id: 'broken' }],
  };
  const missing =
    'Abolished; not a current seat. Past winners are listed under Elections.';
  for (const [partial, overrides] of [
    [false, {}],
    [true, { [path]: bad }],
  ] as const) {
    const view = (await api(overrides).electorateFor(path)).data;
    expect(view.representatives.status).toBe('missing');
    expect(view.representatives.data).toBeNull();
    expect(!!view.representatives.partial).toBe(partial);
    const text = words(
      <RecordBlock
        title="Latest verified representation"
        id="electorate-representatives"
        block={view.representatives}
        missing={missing}
        retry={() => {}}
      >
        {() => null}
      </RecordBlock>,
    );
    expect(text).toContain(missing);
    expect(text).not.toContain('No readable record was found for this person');
    expect(text.includes('Some rows in this export could not be read.')).toBe(
      partial,
    );
  }
});

test('Your MP: an unrelated dropped seat row keeps the vacancy caveat', async () => {
  const chosen = 'el_2e5f061856b85b99acf8ee53';
  const raw = pinned(manifest.index_url) as {
    electorates: { electorate_id: string }[];
  };
  const other = raw.electorates.findIndex(
    (seat) => seat.electorate_id !== chosen,
  );
  expect(other).toBeGreaterThanOrEqual(0);
  const bad = replaceAt(raw, ['electorates', other, 'name'], 7);
  const missing =
    'No verified representative is recorded for this date. This does not establish a vacancy.';
  for (const [partial, overrides] of [
    [false, {}],
    [true, { [manifest.index_url]: bad }],
  ] as const) {
    const view = await api(overrides).yourMP(chosen);
    expect(view.members.status).toBe('missing');
    expect(view.members.data).toBeNull();
    expect(!!view.members.partial).toBe(partial);
    const text = words(
      <RecordBlock
        title="Your member"
        id="your-member"
        block={view.members}
        missing={missing}
        retry={() => {}}
      >
        {() => null}
      </RecordBlock>,
    );
    expect(text).toContain(missing);
    expect(text).not.toContain('No readable record was found for this person');
    expect(text.includes('Some rows in this export could not be read.')).toBe(
      partial,
    );
  }
});
