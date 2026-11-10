import { act, useCallback } from 'react';
import TestRenderer from 'react-test-renderer';
import { useRead } from '../src/api/useRead';
import { ApiClient, type RecordResult } from '../src/api/client';
import { CatalogCache, type CacheStore } from '../src/api/cache';
import { useCatalogRecord } from '../src/features/bills/useCatalogRecord';
import { useRead as useDocumentRead } from '../src/features/records/useRead';
import { useRead as useReferenceRead } from '../src/features/methods/read';
import { useRead as usePeopleRead } from '../src/features/people/Sections';

jest.mock('../src/api/runtime', () => ({ catalogs: {}, peopleDepth: {} }));
jest.mock('@shopify/react-native-skia', () => ({}));
jest.mock('expo-router', () => ({ router: {}, useIsPreview: () => false }));

const decode = (raw: unknown) => raw as { value: string };
type Result = RecordResult<ReturnType<typeof decode>>;

function setup(
  kind: 'read' | 'catalogue' | 'document' | 'reference' | 'people',
  cancelImmediately = false,
) {
  const store: CacheStore = {
    readIndex: jest.fn(async () => []),
    writeIndex: jest.fn(async () => {}),
    read: jest.fn(async () => undefined),
    write: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
  };
  const requests: {
    signal: AbortSignal;
    resolve: (response: Response) => void;
  }[] = [];
  const transport = jest.fn(
    (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve) => {
        requests.push({ signal: init!.signal!, resolve });
      }),
  );
  const cache = new CatalogCache(store);
  const put = jest.spyOn(cache, 'put');
  const client = new ApiClient({
    origin: 'https://example.test',
    version: '1.0.0',
    build: '1',
    cache,
    transport,
    retries: 0,
  });
  // Reflect the optional argument added to the shared loader contracts.
  type Load = (signal?: AbortSignal) => Promise<Result>;
  const subjects = new Map<Load, string>();
  const load = (path: string): Load => {
    const read: Load = (signal) =>
      cancelImmediately
        ? Promise.reject(
            Object.assign(new Error('Cancelled'), { name: 'AbortError' }),
          )
        : client.get(path, decode, false, { signal });
    subjects.set(read, path);
    return read;
  };
  let current!: { record: unknown; error: unknown; retry: () => void };
  function useCatalogue(read: Load) {
    const load = useCallback(
      (
        _refresh: boolean,
        _publish: (record: Result) => void,
        signal?: AbortSignal,
      ) => read(signal),
      [read],
    );
    return useCatalogRecord(load);
  }
  function useDocument(read: Load) {
    const state = useDocumentRead(read);
    return { record: state.value, error: state.error, retry: state.retry };
  }
  function useReference(read: Load) {
    const load = useCallback(
      (_refresh: boolean, signal?: AbortSignal) => read(signal),
      [read],
    );
    return useReferenceRead(load);
  }
  function usePeople(read: Load) {
    const state = usePeopleRead(read, subjects.get(read)!);
    return {
      record: state.read.status === 'ready' ? state.read.value : null,
      error: state.read.status === 'error' ? new Error('Failed') : null,
      retry: state.retry,
    };
  }
  const useProbe = {
    read: useRead,
    catalogue: useCatalogue,
    document: useDocument,
    reference: useReference,
    people: usePeople,
  }[kind];
  function Probe({ read }: { read: Load }) {
    current = useProbe(read);
    return null;
  }
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Probe read={load('/corpus.json')} />);
  });
  return {
    requests,
    store,
    put,
    get current() {
      return current;
    },
    replace() {
      act(() => tree.update(<Probe read={load('/votes.json')} />));
    },
    unmount() {
      act(() => tree.unmount());
    },
  };
}

describe.each([
  'read',
  'catalogue',
  'document',
  'reference',
  'people',
] as const)('%s cancellation', (kind) => {
  test('an AbortError never becomes an error or a retry state', async () => {
    const probe = setup(kind, true);
    await act(async () => {});
    expect(probe.current.error).toBeNull();
    expect(probe.current.record).toBeNull();
    expect(probe.put).not.toHaveBeenCalled();
    probe.unmount();
  });

  test('unmount aborts the transport and a late response never reaches the cache', async () => {
    const probe = setup(kind);
    await act(async () => {});
    expect(probe.requests).toHaveLength(1);
    probe.unmount();
    expect(probe.requests[0]!.signal.aborted).toBe(true);
    await act(async () =>
      probe.requests[0]!.resolve(
        new Response(JSON.stringify({ value: 'Late fixture' })),
      ),
    );
    expect(probe.put).not.toHaveBeenCalled();
    expect(probe.store.write).not.toHaveBeenCalled();
    expect(probe.current.error).toBeNull();
  });

  test('changing subject aborts the old read, and only the new response is published or cached', async () => {
    const probe = setup(kind);
    await act(async () => {});
    probe.replace();
    expect(probe.requests[0]!.signal.aborted).toBe(true);
    await act(async () => {});
    expect(probe.requests[1]!.signal.aborted).toBe(false);
    await act(async () =>
      probe.requests[1]!.resolve(
        new Response(JSON.stringify({ value: 'New fixture' })),
      ),
    );
    expect(probe.current.record).toMatchObject({
      data: { value: 'New fixture' },
    });
    const latest = probe.current.record;
    await act(async () =>
      probe.requests[0]!.resolve(
        new Response(JSON.stringify({ value: 'Old fixture' })),
      ),
    );
    expect(probe.current.record).toBe(latest);
    expect(probe.current.error).toBeNull();
    expect(probe.put).toHaveBeenCalledTimes(1);
    expect(probe.store.write).toHaveBeenCalledTimes(1);
    probe.unmount();
  });
});
