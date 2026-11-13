import { gunzipSync } from 'node:zlib';
import { Linking } from 'react-native';
import PostHog from 'posthog-react-native';
import { analyticsConfig, analyticsOptions } from '../src/analytics';
import type { AnalyticsContext } from '../src/analytics/events';

// The real SDK, with the app's options, sending to a mocked network. Every
// way a raw question could reach PostHog is tried at once: app events with
// extra properties, SDK events the app never sends, super properties,
// person properties, screen properties and a deep link URL on app open.
// Crash and error reports go the same way: an uncaught error, an unhandled
// rejection and a caught error, each carrying the question.
// Nothing that leaves the device may contain the question.
const question = 'Did Senator Example vote against the 2031 housing bill?';
const encoded = encodeURIComponent(question);
const context: AnalyticsContext = {
  platform: 'ios',
  appVersion: '1.1.4',
  appBuild: '43',
  environment: 'production',
};
const config = analyticsConfig({
  analytics: {
    host: 'https://opax.com.au/ingest',
    projectToken: 'phc_AsHnQM2UrGBubA5HU9sagkGbg8vqQLNXu3WjEhPRDejr',
    environment: 'production',
  },
})!;

type Sent = { url: string; method: string; body: string };
const sent: Sent[] = [];
async function decode(body: unknown): Promise<string> {
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  let bytes: Uint8Array;
  if (body instanceof Uint8Array) bytes = body;
  else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
  else if (typeof (body as Blob).arrayBuffer === 'function')
    bytes = new Uint8Array(await (body as Blob).arrayBuffer());
  else return JSON.stringify(body);
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  return Buffer.from(gzip ? gunzipSync(bytes) : bytes).toString('utf8');
}

let posthog: PostHog;
const originalFetch = global.fetch;
// The Hermes and React Native hooks the SDK installs its handlers on.
type Handler = (error: unknown, isFatal: boolean) => void;
let uncaught: Handler | undefined;
let unhandled: ((id: number, error: unknown) => void) | undefined;
const runtime = {
  ErrorUtils: Reflect.get(globalThis, 'ErrorUtils'),
  HermesInternal: Reflect.get(globalThis, 'HermesInternal'),
};
beforeAll(async () => {
  Reflect.set(globalThis, 'ErrorUtils', {
    getGlobalHandler: () => () => {},
    setGlobalHandler: (handler: Handler) => {
      uncaught = handler;
    },
  });
  Reflect.set(globalThis, 'HermesInternal', {
    hasPromise: () => true,
    enablePromiseRejectionTracker: (options: {
      onUnhandled: (id: number, error: unknown) => void;
    }) => {
      unhandled = options.onUnhandled;
    },
  });
  global.fetch = jest.fn(async (input: unknown, init?: RequestInit) => {
    sent.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: await decode(init?.body),
    });
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  jest
    .spyOn(Linking, 'getInitialURL')
    .mockResolvedValue(`opax://ask?question=${encoded}`);
  const store = new Map<string, string>();
  posthog = new PostHog(
    config.projectToken,
    analyticsOptions(config, context, {
      customStorage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
      },
    }),
  );
  await posthog.ready();
  posthog.register({ question, last_search: question });
  posthog.identify(question, { email: 'jo@example.org', question });
  posthog.capture('opax_ask_started', {
    question,
    from_section: question,
    follow_up: false,
  });
  posthog.capture('opax_ask_completed', {
    from_section: 'person',
    follow_up: false,
    duration_ms: 2400,
    source_count: 3,
    has_answer: true,
    answer: question,
  });
  posthog.capture('opax_search_started', {
    scope: 'speech',
    page: 1,
    filter_count: 0,
    query: question,
  });
  posthog.capture('opax_route_error', {
    error_class: 'TypeError',
    route_pattern: '/person/[slug]',
    error_message: question,
    stack: question,
    $screen_name: '/person/jane-citizen',
  });
  posthog.capture('opax_app_start', { duration_ms: 250, question });
  posthog.capture('opax_screen_ready', {
    route_pattern: '/bill/[key]',
    duration_ms: 120,
    $screen_name: '/bill/private-record',
    title: question,
  });
  posthog.capture('$autocapture', { $el_text: question });
  posthog.capture('$exception', { $exception_message: question });
  posthog.capture('opax_question', { question });
  posthog.screen(`/ask/${question}`, { question });
  posthog.screen('/person/[slug]', { slug: 'jane-citizen', question });
  uncaught!(new TypeError(`Cannot read property '${question}' of undefined`), false);
  unhandled!(1, new Error(`Fetch failed: https://opax.com.au/api/ask?q=${encoded}`));
  posthog.addExceptionStep(`Asked ${question}`);
  posthog.captureException(new RangeError(`"${question}"`), { question });
  await posthog.flush();
});
afterAll(async () => {
  await posthog.shutdown();
  global.fetch = originalFetch;
  Reflect.set(globalThis, 'ErrorUtils', runtime.ErrorUtils);
  Reflect.set(globalThis, 'HermesInternal', runtime.HermesInternal);
});

function batch() {
  return sent
    .filter((request) => request.method === 'POST')
    .flatMap((request) => {
      const parsed = JSON.parse(request.body) as {
        batch?: { event: string; properties: Record<string, unknown> }[];
      };
      return parsed.batch ?? [];
    });
}

test('sends only through the opax.com.au proxy', () => {
  expect(sent.length).toBeGreaterThan(0);
  for (const request of sent)
    expect(request.url.startsWith('https://opax.com.au/ingest/')).toBe(true);
});

test('a raw question can never reach a payload', () => {
  const everything = sent
    .map((request) => `${request.url}\n${request.body}`)
    .join('\n');
  expect(everything).toContain('opax_ask_completed');
  expect(everything).not.toContain(question);
  expect(everything).not.toContain(encoded);
  expect(everything).not.toMatch(/housing|Senator Example|example\.org/i);
});

test('only allowlisted events are sent, tagged with the platform and version', () => {
  const events = batch();
  const names = events.map((event) => event.event);
  expect(names).toEqual(
    expect.arrayContaining([
      'Application Installed',
      'Application Opened',
      'opax_ask_started',
      'opax_ask_completed',
      'opax_search_started',
      'opax_route_error',
      'opax_app_start',
      'opax_screen_ready',
      '$screen',
      '$exception',
    ]),
  );
  for (const name of names)
    expect([
      'Application Installed',
      'Application Opened',
      'opax_ask_started',
      'opax_ask_completed',
      'opax_search_started',
      'opax_route_error',
      'opax_app_start',
      'opax_screen_ready',
      '$screen',
      '$exception',
    ]).toContain(name);
  for (const event of events)
    expect(event.properties).toMatchObject({
      platform: 'ios',
      app: 'opax',
      app_version: '1.1.4',
      app_build: '43',
      environment: 'production',
      $process_person_profile: false,
      $geoip_disable: true,
    });
  const ask = events.find((event) => event.event === 'opax_ask_started')!;
  expect(ask.properties.from_section).toBe('other');
  const screens = events
    .filter((event) => event.event === '$screen')
    .map((event) => event.properties.$screen_name);
  expect(screens).toEqual(['/other', '/person/[slug]']);
  expect(
    events.find((event) => event.event === 'opax_route_error')!.properties,
  ).not.toHaveProperty('error_message');
  for (const event of events.filter((event) => event.event.startsWith('opax_')))
    expect(event.properties).not.toHaveProperty('$screen_name');
  expect(sent.map((request) => request.body).join('')).not.toMatch(
    /private-record|jane-citizen/,
  );
});

test('uncaught errors, unhandled rejections and caught errors arrive scrubbed', () => {
  const exceptions = batch().filter((event) => event.event === '$exception');
  expect(
    exceptions.map((event) => {
      const [exception] = event.properties.$exception_list as {
        type: string;
        value?: string;
        mechanism: { handled: boolean };
      }[];
      return [exception!.type, exception!.value, exception!.mechanism.handled];
    }),
  ).toEqual([
    ['TypeError', 'Cannot read property [redacted] of undefined', false],
    // An OPAX URL keeps only its host (exceptions.ts).
    ['Error', 'Fetch failed: https://opax.com.au', false],
    ['RangeError', '[redacted]', true],
  ]);
  for (const event of exceptions) {
    expect(event.properties).not.toHaveProperty('$exception_steps');
    expect(event.properties).not.toHaveProperty('question');
    expect(event.properties).not.toHaveProperty('$app_state');
  }
});
