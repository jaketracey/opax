import { act, useCallback } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  cleanEvent,
  eventFields,
  failedSections,
  scrubEvent,
  sectionFailureKinds,
  type AnalyticsContext,
} from '../src/analytics/events';
import {
  SECTION_REPORT_LIMIT,
  connectSectionReports,
  failureKind,
  reportPageFailure,
  reportReadFailure,
  reportRecordBlocks,
  sectionForPath,
} from '../src/analytics/sections';
import { CatalogCache, type CacheStore } from '../src/api/cache';
import { ApiClient } from '../src/api/client';
import { ApiError, PersonIdentityError, httpError } from '../src/api/errors';
import { useRead } from '../src/api/useRead';
import { markPartial } from '../src/api/validation';
import { useCatalogRecord } from '../src/features/bills/useCatalogRecord';

// docs/ANALYTICS.md, "Section load failures": one event says which block
// failed, how, and on which route template. Nothing about the record.
const context: AnalyticsContext = {
  platform: 'ios',
  appVersion: '1.1.4',
  appBuild: '71',
  environment: 'production',
};
const privateText = 'Jane Citizen asked about the 2031 housing bill';

const send = jest.fn();
let route = '/party/[slug]';
beforeEach(() => {
  send.mockClear();
  route = '/party/[slug]';
  connectSectionReports({ route: () => route, send });
});
afterAll(() => connectSectionReports(null));

describe('the event', () => {
  test('carries its three fixed fields and the standard context, and nothing else', () => {
    expect(Object.keys(eventFields.opax_section_failed)).toEqual([
      'section',
      'kind',
      'route_pattern',
    ]);
    const scrubbed = scrubEvent(
      {
        event: 'opax_section_failed',
        properties: {
          section: 'block_members',
          kind: 'partial',
          route_pattern: '/party/[slug]',
          id: 'person_0123abcd',
          name: 'Jane Citizen',
          title: privateText,
          url: 'https://opax.com.au/party/example?q=private',
          path: '/api/search?q=private',
          error: privateText,
          error_message: privateText,
          status: 503,
          $screen_name: '/party/example-party',
          $current_url: 'opax://party/example-party',
        },
      },
      context,
    );
    expect(scrubbed?.properties).toEqual({
      section: 'block_members',
      kind: 'partial',
      route_pattern: '/party/[slug]',
      $process_person_profile: false,
      $is_identified: false,
      $geoip_disable: true,
      platform: 'ios',
      app: 'opax',
      app_version: '1.1.4',
      app_build: '71',
      environment: 'production',
    });
  });
  test('drops any value that is not on its lists', () => {
    expect(
      cleanEvent('opax_section_failed', {
        section: privateText,
        kind: 'HTTP 503: Jane Citizen',
        route_pattern: '/party/example-party',
      }),
    ).toEqual({});
    for (const section of failedSections)
      for (const kind of sectionFailureKinds)
        expect(cleanEvent('opax_section_failed', { section, kind })).toEqual({
          section,
          kind,
        });
  });
});

describe('what a failure becomes', () => {
  test('a request path maps to a fixed family, never to its own text', () => {
    expect(sectionForPath('/parliamentarians.json')).toBe('read_roster');
    expect(sectionForPath('/api/person-slugs')).toBe('read_slugs');
    expect(sectionForPath('/electorates/manifest.json')).toBe('read_manifest');
    expect(sectionForPath('/electorates/releases/r1/people.json')).toBe(
      'read_people',
    );
    expect(sectionForPath('/electorates/releases/r1/seat-9.json')).toBe(
      'read_electorates',
    );
    expect(sectionForPath('/bills/r1234.json')).toBe('read_bills');
    expect(sectionForPath('/graph/money.vic.json')).toBe('read_money');
    expect(sectionForPath('/api/search?q=jane+citizen')).toBe('read_search');
    expect(sectionForPath('/api/resource/jane-citizen-speech')).toBe(
      'read_record',
    );
    expect(sectionForPath('/somewhere/jane-citizen')).toBe('read_other');
    for (const path of [
      '/api/search?q=jane+citizen',
      '/bills/jane-citizen',
      '/jane-citizen',
    ])
      expect(failedSections).toContain(sectionForPath(path));
  });
  test('an error maps to a fixed kind, or to nothing', () => {
    expect(failureKind(new ApiError('offline', privateText))).toBe('network');
    expect(failureKind(new ApiError('timeout', privateText))).toBe('network');
    expect(failureKind(httpError(404))).toBe('4xx');
    expect(failureKind(httpError(429))).toBe('4xx');
    expect(failureKind(httpError(503))).toBe('5xx');
    expect(failureKind(new ApiError('invalid-data', privateText))).toBe(
      'decode',
    );
    expect(failureKind(new PersonIdentityError(privateText))).toBe('decode');
    // A refused path, a cancelled request and an unknown error are not reads
    // that failed.
    expect(failureKind(new ApiError('forbidden', 'Refused'))).toBeNull();
    expect(
      failureKind(
        Object.assign(new Error('Cancelled'), { name: 'AbortError' }),
      ),
    ).toBeNull();
    expect(failureKind(new Error(privateText))).toBeNull();
  });
  test('a report holds only the section, the kind and the route', () => {
    reportReadFailure('/api/search?q=jane+citizen', httpError(503));
    reportPageFailure(new ApiError('offline', privateText));
    expect(send.mock.calls).toEqual([
      ['read_search', '5xx', '/party/[slug]'],
      ['page', 'network', '/party/[slug]'],
    ]);
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/jane|citizen/i);
  });
});

describe('dedupe', () => {
  test('a retry loop sends one report for a section, kind and route', () => {
    for (let attempt = 0; attempt < 500; attempt++) {
      reportReadFailure('/parliamentarians.json', httpError(503));
      reportReadFailure('/parliamentarians.json', 'partial');
    }
    expect(send.mock.calls).toEqual([
      ['read_roster', '5xx', '/party/[slug]'],
      ['read_roster', 'partial', '/party/[slug]'],
    ]);
    // The same failure seen from another route is a new fact, once.
    route = '/person/[slug]';
    for (let attempt = 0; attempt < 50; attempt++)
      reportReadFailure('/parliamentarians.json', httpError(503));
    expect(send).toHaveBeenCalledTimes(3);
  });
  test('a launch sends at most the limit, whatever fails', () => {
    for (const section of failedSections)
      for (const kind of sectionFailureKinds)
        reportReadFailure(
          '/x',
          // Distinct routes make every report distinct.
          (route = `/${section}/${kind}`) && 'partial',
        );
    expect(send).toHaveBeenCalledTimes(SECTION_REPORT_LIMIT);
  });
  test('with no client connected, nothing is sent or remembered', () => {
    connectSectionReports(null);
    reportReadFailure('/parliamentarians.json', httpError(503));
    expect(send).not.toHaveBeenCalled();
  });
});

const store: CacheStore = {
  readIndex: async () => [],
  writeIndex: async () => {},
  read: async () => undefined,
  write: async () => {},
  remove: async () => {},
};
function client(transport: typeof fetch) {
  return new ApiClient({
    origin: 'https://example.test',
    version: '1.1.4',
    build: '71',
    cache: new CatalogCache(store),
    transport,
    retries: 0,
    onFailure: reportReadFailure,
  });
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('the API client', () => {
  test('reports a failed read once, however often it is retried', async () => {
    const api = client(jest.fn(async () => json({}, 503)) as typeof fetch);
    for (let attempt = 0; attempt < 20; attempt++)
      await expect(
        api.get('/parliamentarians.json', (value) => value, true),
      ).rejects.toMatchObject({ code: 'server' });
    expect(send.mock.calls).toEqual([['read_roster', '5xx', '/party/[slug]']]);
  });
  test('reports a body that cannot be decoded, and a read that dropped rows', async () => {
    const api = client(
      jest.fn(async () => json({ rows: [1, 2] })) as typeof fetch,
    );
    await expect(
      api.get('/votes.json', () => {
        throw new Error(privateText);
      }),
    ).rejects.toMatchObject({ code: 'invalid-data' });
    await api.get('/pay.json', (value) => markPartial({ value }, true));
    await api.get('/agencies.json', (value) => ({ value }));
    expect(send.mock.calls).toEqual([
      ['read_votes', 'decode', '/party/[slug]'],
      ['read_pay', 'partial', '/party/[slug]'],
    ]);
  });
  test('a cancelled read is not a failure', async () => {
    const controller = new AbortController();
    controller.abort();
    const api = client(jest.fn(async () => json({})) as typeof fetch);
    await expect(
      api.get('/votes.json', (value) => value, false, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(send).not.toHaveBeenCalled();
  });
  test('a listener that throws never changes the read', async () => {
    const api = new ApiClient({
      origin: 'https://example.test',
      version: '1.1.4',
      build: '71',
      cache: new CatalogCache(store),
      transport: jest.fn(async () => json({}, 503)) as typeof fetch,
      retries: 0,
      onFailure: () => {
        throw new Error('listener');
      },
    });
    await expect(
      api.get('/votes.json', (value) => value),
    ).rejects.toMatchObject({ code: 'server' });
  });
});

const block = (extra: Record<string, unknown>) => ({
  status: 'ready',
  data: [],
  asAt: null,
  sources: [],
  stale: false,
  savedAt: null,
  ...extra,
});
describe('a loaded record', () => {
  test("reports each block that failed or is partial, by the block's fixed key", () => {
    reportRecordBlocks({
      stale: false,
      data: {
        label: privateText,
        members: block({
          status: 'error',
          data: null,
          error: new ApiError('invalid-data', privateText),
        }),
        past: block({ partial: true }),
        receipts: block({}),
        divisions: block({ status: 'error', error: httpError(503) }),
        'Jane Citizen': block({ partial: true }),
        moneyMeta: { status: 'error', note: privateText },
      },
    });
    expect(send.mock.calls).toEqual([
      ['block_members', 'decode', '/party/[slug]'],
      ['block_past', 'partial', '/party/[slug]'],
      ['block_divisions', '5xx', '/party/[slug]'],
      ['block_other', 'partial', '/party/[slug]'],
    ]);
  });
  test('the catalog record hook reports its blocks and a whole read that failed', async () => {
    type Record = { stale: boolean; data: unknown };
    let fail = false;
    let state!: ReturnType<typeof useCatalogRecord<Record>>;
    function Probe() {
      const load = useCallback(async (): Promise<Record> => {
        if (fail) throw httpError(500);
        return { stale: false, data: { members: block({ partial: true }) } };
      }, []);
      state = useCatalogRecord(load);
      return null;
    }
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<Probe />);
    });
    fail = true;
    // Try again, over and over.
    for (let attempt = 0; attempt < 10; attempt++)
      await act(async () => state.refresh());
    expect(send.mock.calls).toEqual([
      ['block_members', 'partial', '/party/[slug]'],
      ['page', '5xx', '/party/[slug]'],
    ]);
    act(() => tree.unmount());
  });
  test('the plain read hook reports the same way', async () => {
    const load = async () => {
      throw new ApiError('timeout', 'Slow');
    };
    function Probe() {
      useRead(load);
      return null;
    }
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<Probe />);
    });
    expect(send.mock.calls).toEqual([['page', 'network', '/party/[slug]']]);
    act(() => tree.unmount());
  });
});
