import { Dimensions } from 'react-native';
import { router } from 'expo-router';
import { analyticsContext, analyticsOptions, track } from '../src/analytics';
import {
  cleanEvent,
  eventFields,
  scrubEvent,
  type AnalyticsContext,
} from '../src/analytics/events';
import { routePatternFor } from '../src/analytics/route-patterns';
import { redirectSystemPath } from '../src/app/+native-intent';
import {
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
  windowClass,
} from '../src/design/adaptive';
import { openAnswerLink } from '../src/features/ask/AnswerBody';
import { decodeFollowups } from '../src/features/ask/model';
import {
  follow,
  resetFollowsForTests,
  unfollow,
} from '../src/features/follows/store';
import { decodeMoneyGraph } from '../src/features/money/data';
import {
  defaultMoneyFilters,
  moneyFilterCount,
} from '../src/features/money/view';
import {
  CallMeasure,
  noteTalkAccount,
  talkEndReason,
} from '../src/features/talk/measure';
import { openSource } from '../src/navigation/external';
import {
  copyRecordLink,
  shareRecord,
  shareRecordType,
} from '../src/navigation/share';
import { reportAnswer } from '../src/voice/report-answer';
import { pinned } from './pinned';

// docs/ANALYTICS.md, "Feature use": the events added from the 13 Nov PostHog
// scan. Each carries fixed words, bounded counts and flags only; never a
// record, a name, an ID, a slug, a path or any text. Fixtures are invented.
jest.mock('../src/analytics', () => ({
  ...jest.requireActual('../src/analytics'),
  track: jest.fn(),
}));
jest.mock('../modules/opax-share', () => ({
  OpaxShare: {
    share: jest.fn(async () => undefined),
    copyText: jest.fn(async () => undefined),
  },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => undefined),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));
const mockDisk = new Map<string, string>();
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
      mockDisk.set(this.name, body);
    }
  },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { followSources: jest.fn() },
}));

const context: AnalyticsContext = {
  platform: 'ios',
  appVersion: '1.1.4',
  appBuild: '43',
  environment: 'production',
  window: () => ({ layout: 'regular', foldable: true }),
};
// Invented record names, IDs, slugs, paths and text.
const name = 'Jane Citizen';
const slug = 'jane-citizen';
const id = 'au-federal-r9999';
const personKey = 'person_0123456789abcdef01234567';
const question = 'Did Senator Example vote against the 2031 housing bill?';
const privateValues = [
  name,
  slug,
  id,
  personKey,
  question,
  `/subject/person/${slug}`,
  `/bill/${id}`,
  `opax://person/${slug}`,
  `https://opax.com.au/subject/person/${slug}`,
];
const leaks = (value: unknown) => {
  const text = JSON.stringify(value);
  return privateValues.filter((v) => text.includes(v));
};
const calls = () => jest.mocked(track).mock.calls;
const common = [
  '$process_person_profile',
  '$is_identified',
  '$geoip_disable',
  'platform',
  'app',
  'app_version',
  'app_build',
  'environment',
  'layout',
  'foldable',
];

beforeEach(() => {
  jest.mocked(track).mockClear();
  jest.mocked(router.push).mockClear();
});

describe('the boundary', () => {
  // Every property each new event may carry, with a valid value.
  const valid: Record<string, Record<string, unknown>> = {
    opax_talk: {
      action: 'call_ended',
      account: 'signed_in',
      duration_s: 125,
      end_reason: 'network',
    },
    opax_ask_followup_click: { position: 2, kind: 'vote' },
    opax_source_open: {
      from_section: 'ask',
      destination: 'app',
      placement: 'sources_pane',
    },
    opax_share: { kind: 'record', record_type: 'bill' },
    opax_link_open: {
      source: 'widget',
      route_pattern: '/person/[slug]',
      initial: true,
    },
    opax_follow: { action: 'unfollow', kind: 'electorate' },
    opax_answer_feedback: { surface: 'talk', action: 'report_opened' },
    opax_map_action: { action: 'filter', filter_count: 3 },
    opax_edition: { action: 'reached_end' },
  };
  test.each(Object.entries(valid))(
    '%s keeps exactly its listed properties',
    (event, properties) => {
      const extra = {
        name,
        slug,
        id,
        question,
        path: `/subject/person/${slug}`,
        title: name,
        position_text: question,
      };
      expect(cleanEvent(event, { ...properties, ...extra })).toEqual(
        properties,
      );
      expect(
        Object.keys(eventFields[event as keyof typeof eventFields]),
      ).toEqual(Object.keys(properties));
      const scrubbed = scrubEvent(
        { event, properties: { ...properties, ...extra } },
        context,
      )!;
      expect(Object.keys(scrubbed.properties!).sort()).toEqual(
        [...Object.keys(properties), ...common].sort(),
      );
      expect(leaks(scrubbed)).toEqual([]);
    },
  );

  test('a record, slug, ID, path or text in place of any value is never kept', () => {
    for (const event of Object.keys(valid))
      for (const key of Object.keys(valid[event]!))
        for (const value of privateValues) {
          // from_section predates these events and is filled only from
          // currentSection(), a route file's first segment (index.ts).
          if (key === 'from_section') continue;
          const clean = cleanEvent(event, { [key]: value });
          expect(leaks(clean)).toEqual([]);
          const scrubbed = scrubEvent(
            { event, properties: { [key]: value } },
            context,
          );
          expect(leaks(scrubbed)).toEqual([]);
          // A route parameter value is never a template.
          if (key === 'route_pattern') expect(clean).toEqual({});
        }
  });

  test('call length is whole seconds, capped at 600, never negative', () => {
    const seconds = (duration_s: unknown) =>
      cleanEvent('opax_talk', { duration_s })?.duration_s;
    expect(seconds(12.4)).toBe(12);
    expect(seconds(600)).toBe(600);
    expect(seconds(3601)).toBe(600);
    for (const bad of [-1, Infinity, NaN, '30', null])
      expect(seconds(bad)).toBe(undefined);
  });

  test('positions and filter counts stay inside their ranges', () => {
    expect(cleanEvent('opax_ask_followup_click', { position: 0 })).toEqual({});
    expect(cleanEvent('opax_ask_followup_click', { position: 5 })).toEqual({});
    expect(cleanEvent('opax_ask_followup_click', { position: 1.5 })).toEqual(
      {},
    );
    expect(cleanEvent('opax_map_action', { filter_count: 21 })).toEqual({});
    expect(cleanEvent('opax_map_action', { filter_count: 0 })).toEqual({
      filter_count: 0,
    });
  });

  test('the unwired opax_voice_card event is gone', () => {
    expect(cleanEvent('opax_voice_card', { action: 'open' })).toBeNull();
    expect(
      scrubEvent({ event: 'opax_voice_card', properties: {} }, context),
    ).toBeNull();
  });
});

describe('the layout and foldable super properties', () => {
  test('every allowlisted event carries them, as categories only', () => {
    for (const event of [
      ...Object.keys(eventFields),
      '$screen',
      'Application Opened',
    ]) {
      const properties = scrubEvent(
        { event, properties: { $screen_name: '/ask' } },
        context,
      )!.properties!;
      expect(properties).toMatchObject({ layout: 'regular', foldable: true });
    }
    // The window is read as each event is sent.
    let layout: 'compact' | 'regular' = 'compact';
    const live = { ...context, window: () => ({ layout, foldable: false }) };
    expect(
      scrubEvent({ event: 'opax_edition', properties: {} }, live)!.properties,
    ).toMatchObject({ layout: 'compact', foldable: false });
    layout = 'regular';
    expect(
      scrubEvent({ event: 'opax_edition', properties: {} }, live)!.properties,
    ).toMatchObject({ layout: 'regular' });
  });

  test('an unreadable or odd window adds nothing, and the SDK cannot set them', () => {
    const odd = {
      ...context,
      window: () =>
        ({ layout: '390x844', foldable: 'yes' }) as unknown as {
          layout: 'compact';
          foldable: boolean;
        },
    };
    const throwing = {
      ...context,
      window: () => {
        throw new Error('no window');
      },
    };
    for (const ctx of [odd, throwing, { ...context, window: undefined }]) {
      const properties = scrubEvent(
        {
          event: 'opax_edition',
          properties: { layout: 'regular', foldable: true },
        },
        ctx,
      )!.properties!;
      expect(properties).not.toHaveProperty('layout');
      expect(properties).not.toHaveProperty('foldable');
    }
  });

  test('the app context reads the live window class, and before_send adds it', () => {
    const app = analyticsContext('production');
    expect(app.window).toBe(windowClass);
    const options = analyticsOptions(
      {
        host: 'https://opax.com.au/ingest',
        projectToken: 'phc_x',
        environment: 'production',
      },
      app,
    );
    const sent = options.before_send as (event: object) => {
      properties: Record<string, unknown>;
    };
    expect(sent({ event: 'opax_edition', properties: {} }).properties).toEqual(
      expect.objectContaining({ layout: 'compact', foldable: false }),
    );
  });

  test('windowClass is the size class under the window rule and the fold', () => {
    const size = jest.spyOn(Dimensions, 'get');
    try {
      size.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
      expect(windowClass()).toEqual({ layout: 'compact', foldable: false });
      setWindowTraitsOverride({
        horizontal: 'regular',
        vertical: 'regular',
        foldable: true,
      });
      size.mockReturnValue({ width: 900, height: 700, scale: 3, fontScale: 1 });
      expect(windowClass()).toEqual({ layout: 'regular', foldable: true });
    } finally {
      setWindowTraitsOverride(undefined);
      resetAdaptiveDeviceForTests();
      size.mockRestore();
    }
  });
});

describe('route templates for links', () => {
  test.each([
    ['/(tabs)/(today)/person/jane-citizen?from=x', '/person/[slug]'],
    ['/(tabs)/(search)/person/jane-citizen/votes', '/person/[slug]/votes'],
    ['/(tabs)/(bills)/bills', '/bills'],
    ['/explore/photo', '/explore/photo'],
    ['/explore/years-to-come', '/explore/[tool]'],
    ['/licence/sources/a/b/c', '/licence/sources/[...path]'],
    ['/seat/state/nsw', '/seat/state/[code]'],
    ['/', '/'],
    ['/subject/person/jane-citizen', '/other'],
    [`/ask/${encodeURIComponent(question)}`, '/other'],
  ])('%s is %s', (path, pattern) => {
    expect(routePatternFor(path)).toBe(pattern);
  });
});

describe('fire points', () => {
  test('opax_share: a record share, a question share and a copied link, as kinds only', async () => {
    await shareRecord({ path: `/subject/person/${slug}`, title: name });
    expect(calls()).toEqual([
      ['opax_share', { kind: 'record', record_type: 'person' }],
    ]);
    jest.mocked(track).mockClear();
    await shareRecord({
      path: '/ask',
      title: question,
      question: {
        text: question,
        options: {
          kind: 'all',
          speaker: name,
          party: '',
          state: '',
          topic: '',
          from: '',
          to: '',
        },
      },
    });
    expect(calls()).toEqual([['opax_share', { kind: 'question' }]]);
    jest.mocked(track).mockClear();
    await copyRecordLink(`/bill/${id}`);
    expect(calls()).toEqual([
      ['opax_share', { kind: 'copy_link', record_type: 'bill' }],
    ]);
    expect(leaks(calls())).toEqual([]);
  });

  test.each([
    [`/subject/person/${slug}`, 'person'],
    ['/subject/party/Example%20Party', 'party'],
    ['/subject/electorate/Example', 'electorate'],
    ['/subject/topic/housing', 'other'],
    [`/bill/${id}?division=d1`, 'bill'],
    ['/doc/fixture-speech', 'doc'],
    ['/money/grants?jur=federal', 'money'],
    ['https://opax.com.au/subject/person/jane-citizen', 'person'],
    ['/ask', 'other'],
  ])('a shared %s is a %s', (path, type) => {
    expect(shareRecordType(path)).toBe(type);
  });

  test('opax_link_open: the route template, how the link came in and the cold start', () => {
    const open = (path: string, initial: boolean) =>
      redirectSystemPath({ path, initial });
    const widget = open(
      `https://opax.com.au/subject/person/${slug}?src=widget`,
      true,
    );
    // The widget marker is read, then stripped from the destination.
    expect(widget).not.toContain('src=');
    expect(widget).toContain(slug);
    expect(calls()).toEqual([
      [
        'opax_link_open',
        { source: 'widget', route_pattern: '/person/[slug]', initial: true },
      ],
    ]);
    jest.mocked(track).mockClear();
    open(`https://opax.com.au/bill/${id}`, false);
    open(`opax://person/${slug}`, false);
    open('opax://follows', true);
    expect(calls()).toEqual([
      [
        'opax_link_open',
        { source: 'universal', route_pattern: '/bill/[key]', initial: false },
      ],
      [
        'opax_link_open',
        { source: 'scheme', route_pattern: '/person/[slug]', initial: false },
      ],
      [
        'opax_link_open',
        { source: 'scheme', route_pattern: '/follows', initial: true },
      ],
    ]);
    expect(leaks(calls())).toEqual([]);
    jest.mocked(track).mockClear();
    // Another site's link is not ours to count.
    expect(open('https://example.org/x?src=widget', true)).toBe(
      'https://example.org/x?src=widget',
    );
    expect(calls()).toEqual([]);
  });

  test('opax_follow: a saved follow and unfollow and the kind, never which', async () => {
    mockDisk.clear();
    resetFollowsForTests();
    expect(await follow({ kind: 'person', id: personKey, title: name })).toBe(
      'followed',
    );
    expect(calls()).toEqual([
      ['opax_follow', { action: 'follow', kind: 'person' }],
    ]);
    // Following again saves nothing, so sends nothing.
    expect(await follow({ kind: 'person', id: personKey, title: name })).toBe(
      'already',
    );
    await unfollow(`person:${personKey}`);
    await unfollow(`person:${personKey}`);
    expect(calls()).toEqual([
      ['opax_follow', { action: 'follow', kind: 'person' }],
      ['opax_follow', { action: 'unfollow', kind: 'person' }],
    ]);
    expect(leaks(calls())).toEqual([]);
    expect(
      cleanEvent('opax_follow', {
        action: 'unfollow',
        kind: `person:${personKey}`,
      }),
    ).toEqual({ action: 'unfollow' });
  });

  test('opax_answer_feedback: Talk opening a report, without the record', async () => {
    await reportAnswer(`/subject/person/${slug}`);
    expect(calls()).toEqual([
      ['opax_answer_feedback', { surface: 'talk', action: 'report_opened' }],
      ['opax_source_open', { from_section: 'other', destination: 'browser' }],
    ]);
  });

  test('opax_source_open: an Ask original and an Ask record carry their placement', async () => {
    await openSource('https://example.org/hansard/1', name, 'inline');
    expect(calls()).toEqual([
      [
        'opax_source_open',
        { from_section: 'other', destination: 'browser', placement: 'inline' },
      ],
    ]);
    jest.mocked(track).mockClear();
    openAnswerLink(`/bill/${id}`, 'sources_pane');
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(calls()).toEqual([
      [
        'opax_source_open',
        {
          from_section: 'other',
          destination: 'app',
          placement: 'sources_pane',
        },
      ],
    ]);
    jest.mocked(track).mockClear();
    // An answer's prose link is no source: it opens, and sends nothing.
    openAnswerLink(`/bill/${id}`);
    expect(router.push).toHaveBeenCalledTimes(2);
    expect(calls()).toEqual([]);
  });

  test('follow-ups keep only the server’s fixed kinds', () => {
    expect(
      decodeFollowups({
        questions: [
          { question: 'One?', kind: 'vote' },
          { question: 'Two?', kind: name },
          { question: 'Three?' },
        ],
      }).map((f) => f.kind),
    ).toEqual(['vote', undefined, undefined]);
  });

  test('the money map counts filters, never which', () => {
    const graph = decodeMoneyGraph(pinned('/graph/money.json'));
    const initial = defaultMoneyFilters(graph);
    expect(moneyFilterCount(graph, initial)).toBe(0);
    expect(
      moneyFilterCount(graph, {
        ...initial,
        from: initial.from + 1,
        to: initial.to - 1,
        industry: 'mining,gambling',
        grants: false,
      }),
    ).toBe(3);
  });
});

describe('Talk calls', () => {
  const status = {
    enabled: true,
    signedIn: true,
    unlimited: false,
    totalSeconds: 600,
    remainingSeconds: 600,
    activeSession: null,
    budgetOpen: true,
  };
  afterEach(() => noteTalkAccount(null));

  test('a call that goes live reports its start, then its capped length and reason', () => {
    let now = 1_000;
    const measure = new CallMeasure(() => now);
    noteTalkAccount(status);
    measure.begin();
    measure.state('connecting', null);
    expect(calls()).toEqual([]);
    measure.state('live', null);
    measure.state('live', null);
    now += 700_000;
    measure.state('ended', 'callLimit');
    measure.state('ended', 'callLimit');
    expect(calls()).toEqual([
      ['opax_talk', { action: 'call_started', account: 'signed_in' }],
      [
        'opax_talk',
        {
          action: 'call_ended',
          account: 'signed_in',
          duration_s: 600,
          end_reason: 'limit',
        },
      ],
    ]);
  });

  test('a refused Start reports one failure, and a call it did not start nothing', () => {
    const measure = new CallMeasure(() => 0);
    measure.state('live', null);
    measure.state('ended', 'user');
    expect(calls()).toEqual([]);
    noteTalkAccount({ ...status, signedIn: false });
    measure.begin();
    measure.refused('signedOut');
    measure.state('failed', null);
    expect(calls()).toEqual([
      [
        'opax_talk',
        { action: 'call_failed', account: 'signed_out', end_reason: 'user' },
      ],
    ]);
  });

  test('leaving Talk mid-call ends it as the reader’s choice', () => {
    let now = 0;
    const measure = new CallMeasure(() => now);
    measure.begin();
    measure.state('live', null);
    now = 42_400;
    measure.left();
    measure.left();
    expect(calls().at(-1)).toEqual([
      'opax_talk',
      { action: 'call_ended', duration_s: 42, end_reason: 'user' },
    ]);
    expect(calls()).toHaveLength(2);
  });

  test.each([
    ['user', 'user'],
    ['background', 'user'],
    ['interruption', 'user'],
    ['deadline', 'limit'],
    ['allowanceExhausted', 'limit'],
    ['network', 'network'],
    ['provider', 'network'],
    ['failed', 'error'],
  ] as const)('ending %s is %s', (reason, word) => {
    expect(talkEndReason(reason)).toBe(word);
  });
});
