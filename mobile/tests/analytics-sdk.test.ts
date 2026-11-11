import { gunzipSync } from 'node:zlib';
import { Linking } from 'react-native';
import PostHog from 'posthog-react-native';
import { analyticsConfig, analyticsOptions } from '../src/analytics';
import type { AnalyticsContext } from '../src/analytics/events';

// The real SDK, with the app's options, sending to a mocked network. Every
// way a raw question could reach PostHog is tried at once: app events with
// extra properties, SDK events the app never sends, super properties,
// person properties, screen properties and a deep link URL on app open.
// Nothing that leaves the device may contain the question.
const question = 'Did Senator Example vote against the 2031 housing bill?';
const encoded = encodeURIComponent(question);
const context: AnalyticsContext = {
  platform: 'ios',
  appVersion: '1.1.2',
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
beforeAll(async () => {
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
  posthog.capture('$autocapture', { $el_text: question });
  posthog.capture('$exception', { $exception_message: question });
  posthog.capture('opax_question', { question });
  posthog.screen(`/ask/${question}`, { question });
  posthog.screen('/person/[slug]', { slug: 'jane-citizen', question });
  await posthog.flush();
});
afterAll(async () => {
  await posthog.shutdown();
  global.fetch = originalFetch;
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
      '$screen',
    ]),
  );
  for (const name of names)
    expect([
      'Application Installed',
      'Application Opened',
      'opax_ask_started',
      'opax_ask_completed',
      'opax_search_started',
      '$screen',
    ]).toContain(name);
  for (const event of events)
    expect(event.properties).toMatchObject({
      platform: 'ios',
      app: 'opax',
      app_version: '1.1.2',
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
});
