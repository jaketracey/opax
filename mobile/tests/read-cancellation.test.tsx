import { act, useCallback } from 'react';
import TestRenderer from 'react-test-renderer';
import { useRead } from '../src/api/useRead';
import { ApiClient, type RecordResult } from '../src/api/client';
import { CatalogCache, type CacheStore } from '../src/api/cache';
import { useCatalogRecord } from '../src/features/bills/useCatalogRecord';
import { useRead as useDocumentRead } from '../src/features/records/useRead';

const decode = (raw: unknown) => raw as { value: string };
type Result = RecordResult<ReturnType<typeof decode>>;

function setup(kind: 'read' | 'catalogue' | 'document') {
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
  const load =
    (path: string): Load =>
    (signal) =>
      client.get(path, decode, false, { signal });
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
  const useProbe =
    kind === 'catalogue'
      ? useCatalogue
      : kind === 'document'
        ? useDocument
        : useRead;
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

describe.each(['read', 'catalogue', 'document'] as const)(
  '%s cancellation',
  (kind) => {
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
  },
);
