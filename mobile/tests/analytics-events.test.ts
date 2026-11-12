import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  cleanEvent,
  eventFields,
  screenName,
  scrubEvent,
  sectionOf,
  scrubErrorMessage,
  ERROR_MESSAGE_MAX_LENGTH,
  type AnalyticsContext,
} from '../src/analytics/events';

// docs/ANALYTICS.md: the app sends only allowlisted events, each with only
// its categories, counts and flags. These tests hold the two guards to that.
const context: AnalyticsContext = {
  platform: 'ios',
  appVersion: '1.1.4',
  appBuild: '43',
  environment: 'production',
};
const question = 'Did Senator Example vote against the 2031 housing bill?';

describe('cleanEvent', () => {
  test.each(['stall', 'deadline', 'network', 'server', 'no_answer'])(
    'Ask reasons accept only the fixed vocabulary: %s',
    (reason) => {
      for (const event of ['opax_ask_completed', 'opax_ask_failed']) {
        expect(cleanEvent(event, { reason, question })).toEqual({ reason });
        const scrubbed = scrubEvent(
          { event, properties: { reason, question, error: question } },
          context,
        );
        expect(scrubbed?.properties?.reason).toBe(reason);
        expect(JSON.stringify(scrubbed)).not.toContain(question);
        expect(cleanEvent(event, { reason: question })).toEqual({});
      }
    },
  );
  test('keeps only listed events', () => {
    expect(cleanEvent('opax_question', { question })).toBeNull();
    expect(cleanEvent('$autocapture')).toBeNull();
    expect(cleanEvent('$exception')).toBeNull();
    expect(cleanEvent('toString')).toBeNull();
    expect(cleanEvent('__proto__')).toBeNull();
  });

  test('keeps only each event’s listed properties, checked by kind', () => {
    expect(
      cleanEvent('opax_ask_completed', {
        question,
        answer: question,
        from_section: 'person',
        follow_up: true,
        duration_ms: 1234.6,
        source_count: 4,
        has_answer: true,
      }),
    ).toEqual({
      from_section: 'person',
      follow_up: true,
      duration_ms: 1235,
      source_count: 4,
      has_answer: true,
    });
    expect(
      cleanEvent('opax_search_completed', {
        scope: 'speech',
        page: 1,
        result_count: '20',
        total_count: -1,
        duration_ms: Number.POSITIVE_INFINITY,
        query: question,
      }),
    ).toEqual({ scope: 'speech', page: 1 });
    expect(
      cleanEvent('opax_search_started', { scope: question, filter_count: 2.5 }),
    ).toEqual({});
    expect(
      cleanEvent('opax_source_open', {
        from_section: 'ask',
        destination: 'https://example.org/hansard',
      }),
    ).toEqual({ from_section: 'ask' });
  });

  test('a section that is not a route name becomes "other", never the text', () => {
    for (const value of [question, 'Person', '2031', 'ask/[id]', ''])
      expect(cleanEvent('opax_ask_started', { from_section: value })).toEqual({
        from_section: 'other',
      });
  });

  test('every rule rejects free text', () => {
    for (const [event, rules] of Object.entries(eventFields)) {
      const properties = Object.fromEntries(
        Object.keys(rules).map((key) => [key, question]),
      );
      const clean = cleanEvent(event, properties)!;
      expect(JSON.stringify(clean)).not.toContain(question);
      for (const value of Object.values(clean)) expect(value).toBe('other');
    }
  });
});

describe('scrubEvent', () => {
  test('error messages must exactly match a short content-free diagnostic', () => {
    expect(scrubErrorMessage('Network request failed')).toBe(
      'Network request failed',
    );
    for (const unsafe of [
      question,
      'Jane Citizen',
      'ask?q=private',
      'jo@example.org',
      'https://example.org/record/private',
      'Network request failed: Jane Citizen',
      'Network request failed\nprivate',
      'x'.repeat(ERROR_MESSAGE_MAX_LENGTH + 1),
      42,
    ]) {
      expect(scrubErrorMessage(unsafe)).toBeUndefined();
      expect(cleanEvent('opax_route_error', { error_message: unsafe })).toEqual(
        {},
      );
      expect(
        scrubEvent(
          { event: 'opax_route_error', properties: { error_message: unsafe } },
          context,
        )?.properties?.error_message,
      ).toBeUndefined();
    }
    expect(
      scrubEvent(
        {
          event: 'opax_route_error',
          properties: { error_message: 'Network request failed' },
        },
        context,
      )?.properties?.error_message,
    ).toBe('Network request failed');
  });

  test('timing events keep only bounded durations and fixed top-screen templates', () => {
    expect(
      cleanEvent('opax_app_start', { duration_ms: 123.4, question }),
    ).toEqual({ duration_ms: 123 });
    for (const duration_ms of [-1, Infinity, NaN, 3_600_001, '123'])
      expect(cleanEvent('opax_app_start', { duration_ms })).toEqual({});
    for (const route_pattern of [
      '/person/jane-citizen',
      '/bill/private',
      '/search?q=private',
      question,
    ]) {
      expect(cleanEvent('opax_screen_ready', { route_pattern })).toEqual({});
      expect(
        scrubEvent(
          {
            event: 'opax_screen_ready',
            properties: { route_pattern, $screen_name: '/person/jane-citizen' },
          },
          context,
        )?.properties,
      ).not.toHaveProperty('route_pattern');
    }
    expect(
      scrubEvent(
        {
          event: 'opax_screen_ready',
          properties: {
            route_pattern: '/person/[slug]',
            duration_ms: 50,
            $screen_name: '/person/jane-citizen',
            question,
          },
        },
        context,
      )?.properties,
    ).toMatchObject({ route_pattern: '/person/[slug]', duration_ms: 50 });
    expect(
      scrubEvent(
        {
          event: 'opax_screen_ready',
          properties: { $screen_name: '/person/jane-citizen' },
        },
        context,
      )?.properties,
    ).not.toHaveProperty('$screen_name');
  });

  test('drops SDK events that are not on the list', () => {
    for (const event of [
      '$autocapture',
      '$exception',
      '$identify',
      '$create_alias',
      '$set',
      '$groupidentify',
      '$feature_flag_called',
      'survey shown',
      '$snapshot',
      '$pageview',
      'Deep Link Opened',
    ])
      expect(
        scrubEvent({ event, properties: { $screen_name: '/ask' } }, context),
      ).toBeNull();
    expect(scrubEvent(null, context)).toBeNull();
  });

  test('rebuilds properties from the lists and tags platform and version', () => {
    const scrubbed = scrubEvent(
      {
        event: 'Application Opened',
        uuid: 'event-uuid',
        distinct_id: 'anonymous-id',
        properties: {
          url: `opax://ask?q=${encodeURIComponent(question)}`,
          referring_application: 'com.example.notes',
          from_background: false,
          $lib: 'posthog-react-native',
          $lib_version: '4.85.1',
          $session_id: '0196f3a2-1b2c-7d3e-8f40-123456789abc',
          $screen_height: 852,
          $screen_width: 393,
          $locale: 'en-AU',
          $timezone: 'Australia/Melbourne',
          $device_name: 'Jo’s iPhone',
          $os_version: '27.0',
          $app_namespace: 'au.com.opax',
          $active_feature_flags: ['x'],
          $feature_flag_payloads: { x: question },
          $set: { email: 'jo@example.org' },
          $process_person_profile: true,
          question,
        },
        $set: { name: question },
        $set_once: { first: question },
      },
      context,
    )!;
    expect(scrubbed.properties).toEqual({
      $lib: 'posthog-react-native',
      $lib_version: '4.85.1',
      $session_id: '0196f3a2-1b2c-7d3e-8f40-123456789abc',
      $process_person_profile: false,
      $is_identified: false,
      $geoip_disable: true,
      platform: 'ios',
      app: 'opax',
      app_version: '1.1.4',
      app_build: '43',
      environment: 'production',
    });
    expect(scrubbed.$set).toBeUndefined();
    expect(scrubbed.$set_once).toBeUndefined();
    expect(scrubbed.uuid).toBe('event-uuid');
    expect(JSON.stringify(scrubbed)).not.toContain(question);
    expect(JSON.stringify(scrubbed)).not.toMatch(/housing|example\.org|Jo’s/);
  });

  test('keeps route templates on $screen and drops a screen with no name', () => {
    const screen = (name: unknown) =>
      scrubEvent(
        { event: '$screen', properties: { $screen_name: name } },
        context,
      )?.properties?.$screen_name;
    expect(screen('/')).toBe('/');
    expect(screen('/person/[slug]')).toBe('/person/[slug]');
    expect(screen('/person/jane-citizen')).toBe('/person/jane-citizen');
    expect(screen(`/ask/${question}`)).toBe('/other');
    expect(screen('person')).toBe('/other');
    expect(screen(undefined)).toBeUndefined();
    expect(screen(42)).toBeUndefined();
  });

  test('keeps Application Updated versions and nothing else', () => {
    expect(
      scrubEvent(
        {
          event: 'Application Updated',
          properties: {
            previous_version: '1.1.0',
            previous_build: '42',
            version: question,
          },
        },
        context,
      )?.properties,
    ).toMatchObject({ previous_version: '1.1.0', previous_build: '42' });
    expect(
      scrubEvent(
        {
          event: 'Application Updated',
          properties: { previous_version: question },
        },
        context,
      )?.properties?.previous_version,
    ).toBeUndefined();
  });
});

describe('screen names', () => {
  test('are route templates without groups or index', () => {
    expect(screenName([])).toBe('/');
    expect(screenName(['(tabs)', '(today)', 'index'])).toBe('/');
    expect(
      screenName([
        '(tabs)',
        '(today,your-mp,bills,search,ask)',
        'person',
        '[slug]',
      ]),
    ).toBe('/person/[slug]');
    expect(screenName(['account', 'delete', 'code'])).toBe(
      '/account/delete/code',
    );
    expect(screenName(['licence', 'sources', '[...path]'])).toBe(
      '/licence/sources/[...path]',
    );
    expect(screenName(['+not-found'])).toBe('/other');
    expect(screenName([question])).toBe('/other');
    expect(screenName(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])).toBe(
      '/other',
    );
  });

  test('every route file in src/app has a template name', () => {
    const root = join(__dirname, '../src/app');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else files.push(relative(root, path));
      }
    };
    walk(root);
    const routes = files.filter(
      (file) => !/(^|\/)[_+][^/]*$/.test(file) && /\.tsx?$/.test(file),
    );
    expect(routes.length).toBeGreaterThan(80);
    for (const file of routes) {
      const segments = file.replace(/\.tsx?$/, '').split('/');
      const name = screenName(segments);
      expect([file, name]).not.toEqual([file, '/other']);
      expect(name.startsWith('/')).toBe(true);
    }
  });

  test('sections are the first route segment', () => {
    expect(sectionOf('/')).toBe('today');
    expect(sectionOf('/person/[slug]')).toBe('person');
    expect(sectionOf('/other')).toBe('other');
    expect(sectionOf(null)).toBe('other');
  });
});
