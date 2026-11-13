import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ErrorTracking as T } from '@posthog/core';
import { beforeSend, cleanEvent, cleanMessage, automationReason, likelyBot, whenMeasurable } from '../analytics/privacy.mjs';

// Error reports ($exception) are built by posthog-js and scrubbed by
// cleanException inside beforeSend. The builder here is the one posthog-js
// 1.427.2 uses (buildErrorPropertiesBuilder in posthog-exceptions.js), so the
// inputs have the shape the browser produces. All reader text is invented.
const builder = new T.ErrorPropertiesBuilder([
  new T.DOMExceptionCoercer(), new T.PromiseRejectionEventCoercer(), new T.ErrorEventCoercer(), new T.ErrorCoercer(),
  new T.EventCoercer(), new T.ObjectCoercer(), new T.StringCoercer(), new T.PrimitiveCoercer(),
], T.createDefaultStackParser());
const uncaught = (input) => builder.buildFromUnknown(input, { mechanism: { handled: false } });
function thrown(message, frames, Type = TypeError) {
  const err = new Type(message);
  err.stack = `${err.name}: ${message}\n${frames.map((f) => `    at ${f}`).join('\n')}`;
  return uncaught(err);
}
const report = (properties) => beforeSend({ event: '$exception', properties: { $current_url: 'https://opax.com.au/search?q=quokka', ...properties } });
const OWN = 'runSearch (https://opax.com.au/app.js?v=20261113-1:120:33)';
const leaks = (value) => /quokka|marmalade|wattlebird|key=/i.test(JSON.stringify(value));

test('an error report keeps the type, frames on OPAX\'s origin, lines and columns, and loses reader text', () => {
  const event = report(thrown('Failed to load /search?q=quokka%20marmalade#top and https://opax.com.au/#/ask?q=quokka for "quokka marmalade" with \'quokka\' and `marmalade`', [
    OWN,
    'HTMLFormElement.<anonymous> (https://opax.com.au/search?q=quokka+marmalade:4:9)',
    'https://cdn.example.net/widget.js?key=wattlebird:1:2',
  ]));
  assert.deepEqual(event.properties, {
    $current_url: 'https://opax.com.au/search',
    $pathname: '/search',
    $exception_list: [{
      type: 'TypeError',
      value: 'Failed to load /search and https://opax.com.au/ for <redacted> with <redacted> and <redacted>',
      mechanism: { type: 'generic', handled: false, synthetic: false },
      stacktrace: { type: 'raw', frames: [
        { platform: 'web:javascript', function: '?', in_app: false, lineno: 1, colno: 2 },
        { platform: 'web:javascript', function: 'HTMLFormElement.<anonymous>', in_app: true, filename: 'https://opax.com.au/search', lineno: 4, colno: 9 },
        { platform: 'web:javascript', function: 'runSearch', in_app: true, filename: 'https://opax.com.au/app.js', lineno: 120, colno: 33 },
      ] },
    }],
    $exception_level: 'error',
  });
  assert.ok(!leaks(event), JSON.stringify(event));
});

test('messages lose query strings, fragments and quoted text, and are capped', () => {
  for (const [input, expected] of [
    ['/ask?q=quokka', '/ask'],
    ['GET https://opax.com.au/api/search?q=quokka+marmalade&kind=all failed', 'GET https://opax.com.au/api/search failed'],
    ['route #/search?q=quokka', 'route'],
    ['next=%2Fsearch%3Fq%3Dquokka', 'next=%2Fsearch'],
    ['Unexpected token \'q\', "quokka mar"... is not valid JSON', 'Unexpected token <redacted>, <redacted>... is not valid JSON'],
    ['‘quokka’ and “marmalade”', '<redacted> and <redacted>'],
    ['Unterminated "quokka marmalade', 'Unterminated <redacted>'],
    ["Can't find variable: gtag", "Can't find variable: gtag"],
    ['first\nsecond\u0000 third', 'first second third'],
    [42, ''],
  ]) assert.equal(cleanMessage(input), expected, String(input));
  assert.equal(cleanMessage('x'.repeat(500)).length, 200);
  const long = report(thrown('y'.repeat(500), [OWN]));
  assert.equal(long.properties.$exception_list[0].value.length, 200);
});

test('rejected or thrown values that are not errors are redacted unless they are plain literals', () => {
  const values = (input) => report(uncaught(input)).properties.$exception_list.map((e) => [e.type, e.value]);
  assert.deepEqual(values(new CustomEvent('unhandledrejection', { detail: { reason: 'quokka marmalade' } })),
    [['UnhandledRejection', 'Non-Error promise rejection captured with value: <redacted>']]);
  assert.deepEqual(values(new CustomEvent('unhandledrejection', { detail: { reason: undefined } })),
    [['UnhandledRejection', 'Non-Error promise rejection captured with value: undefined']]);
  assert.deepEqual(values(404), [['Error', 'Primitive value captured as exception: 404']]);
  assert.deepEqual(values({ name: 'QuokkaError', message: 'quokka marmalade' }), [['QuokkaError', '<redacted> captured as exception with message: <redacted>']]);
  const cause = new RangeError('inner "quokka"');
  cause.stack = `RangeError: inner\n    at ${OWN}`;
  const caused = new Error('outer', { cause });
  caused.stack = `Error: outer\n    at ${OWN}`;
  assert.deepEqual(values(caused), [['Error', 'outer'], ['RangeError', 'inner <redacted>']]);
  assert.ok(!leaks(values(caused)));
});

test('errors from browser extensions, from other sites only, and bare cross-origin script errors are not sent', () => {
  for (const scheme of ['chrome-extension://abcdefgh', 'moz-extension://1234-5678', 'safari-web-extension://ABCD'])
    assert.equal(report(thrown('quokka', [OWN, `inject (${scheme}/content.js:1:1)`])), null, scheme);
  assert.equal(report(thrown('quokka', ['widget (https://cdn.example.net/widget.js:1:1)', 'https://other.example.org/a.js:2:2'])), null);
  // An address that only looks like OPAX's is another origin.
  assert.equal(report(thrown('quokka', ['x (https://opax.com.au.example.net/app.js:1:1)'])), null);
  assert.equal(report(uncaught('Script error.')), null);
  assert.equal(report({}), null);
  assert.equal(report({ $exception_list: 'quokka' }), null);
  // No stack at all: nothing places it on another origin, so it is still sent, scrubbed.
  assert.equal(report(uncaught(new CustomEvent('unhandledrejection', { detail: { reason: null } }))).properties.$exception_list.length, 1);
  // www is OPAX too.
  assert.equal(report(thrown('quokka', ['go (https://www.opax.com.au/app.js:1:1)'])).properties.$exception_list[0].stacktrace.frames[0].filename, 'https://www.opax.com.au/app.js');
});

test('only the exception list, level and a plain fingerprint survive; SDK extras and frame context are dropped', () => {
  const built = thrown('boom', [OWN]);
  const frame = built.$exception_list[0].stacktrace.frames[0];
  Object.assign(frame, { abs_path: 'https://opax.com.au/app.js?q=quokka', context_line: 'quokka', pre_context: ['quokka'], vars: { q: 'quokka' }, module: 'quokka', chunk_id: 'c0ffee-1' });
  Object.assign(built.$exception_list[0], { module: 'quokka', thread_id: 7 });
  built.$exception_list[0].mechanism.source = 'quokka';
  built.$exception_list.push({ type: 'Quokka marmalade', value: 'inner', stacktrace: { type: 'raw', frames: [{ platform: 'web:javascript', filename: 'https://opax.com.au/chunks/a.js', function: 'go("quokka")', lineno: 1.5, colno: -1 }] } });
  const event = report({ ...built, $exception_level: 'warning', $exception_fingerprint: 'search-render:v2',
    $exception_steps: [{ $message: 'quokka' }], $exception_message: 'quokka', $exception_source: 'https://opax.com.au/?q=quokka', $exception_personURL: 'quokka', $exception_types: ['quokka'] });
  const p = event.properties;
  assert.deepEqual(Object.keys(p).filter((k) => k.startsWith('$exception')).sort(), ['$exception_fingerprint', '$exception_level', '$exception_list']);
  assert.equal(p.$exception_level, 'warning');
  assert.equal(p.$exception_fingerprint, 'search-render:v2');
  assert.deepEqual(p.$exception_list[0].stacktrace.frames[0], { platform: 'web:javascript', function: 'runSearch', in_app: true, filename: 'https://opax.com.au/app.js', lineno: 120, colno: 33, chunk_id: 'c0ffee-1' });
  assert.deepEqual(Object.keys(p.$exception_list[0]).sort(), ['mechanism', 'stacktrace', 'type', 'value']);
  assert.deepEqual(p.$exception_list[0].mechanism, { type: 'generic', handled: false, synthetic: false });
  assert.deepEqual(p.$exception_list[1], { type: 'Error', value: 'inner', stacktrace: { type: 'raw', frames: [{ platform: 'web:javascript', function: '?', in_app: true, filename: 'https://opax.com.au/chunks/a.js' }] } });
  assert.ok(!leaks(event), JSON.stringify(event));
  const odd = report({ ...thrown('boom', [OWN]), $exception_level: 'quokka', $exception_fingerprint: 'quokka marmalade' }).properties;
  assert.equal(odd.$exception_level, 'error');
  assert.equal(odd.$exception_fingerprint, undefined);
  // Other events never go through the exception filter.
  assert.equal(beforeSend({ event: '$pageview', properties: { $current_url: 'https://opax.com.au/' } }).properties.$exception_list, undefined);
});

function loadAdapter(nav = {}, win = {}, doc = {}) {
  let options = null; let inits = 0;
  const context = {
    URL, location: { hostname: 'opax.com.au' }, navigator: { userAgent: 'Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36', languages: ['en-AU'], ...nav },
    window: { innerWidth: 1280, innerHeight: 720, ...win }, document: { visibilityState: 'visible', ...doc }, addEventListener() {},
    cleanEvent, beforeSend, automationReason, likelyBot, whenMeasurable,
    posthog: { init(_token, o) { inits++; options = o; }, capture() {} },
  };
  runInNewContext(readFileSync(new URL('../analytics/index.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''), context);
  return { context, options: () => options, inits: () => inits };
}

test('the client turns on uncaught errors and rejections itself, never console errors, extension errors or steps', () => {
  const { options } = loadAdapter();
  assert.deepEqual({ ...options().capture_exceptions }, { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: false });
  assert.equal(options().error_tracking.captureExtensionExceptions, false);
  assert.equal(options().error_tracking.exception_steps.enabled, false);
  assert.equal(options().disable_external_dependency_loading, true);
  const adapter = readFileSync(new URL('../analytics/index.js', import.meta.url), 'utf8');
  assert.match(adapter, /^import 'posthog-js\/dist\/exception-autocapture';$/m);
});

test('error reports pass the automated-browser filter and carry likely_bot like every event', () => {
  const { context, options } = loadAdapter();
  const send = () => options().before_send({ event: '$exception', properties: { $current_url: 'https://opax.com.au/ask?q=quokka', ...thrown('Failed for "quokka"', [OWN]) } });
  const sent = send();
  assert.equal(sent.properties.likely_bot, false);
  assert.equal(sent.properties.$exception_list[0].value, 'Failed for <redacted>');
  assert.equal(sent.properties.$current_url, 'https://opax.com.au/ask');
  assert.ok(!leaks(sent));
  context.navigator.webdriver = true;
  assert.equal(send(), null);
  // A headless browser never starts PostHog, so it never hooks errors.
  assert.equal(loadAdapter({ userAgent: 'HeadlessChrome/141' }).inits(), 0);
});

test('the served bundle carries the error hooks and the explicit capture settings', () => {
  const bundle = readFileSync(new URL('../public/analytics.js', import.meta.url), 'utf8');
  // Minified output; a stale bundle (build not rerun) fails here.
  for (const piece of ['errorWrappingFunctions', 'capture_exceptions:{capture_unhandled_errors:!0,capture_unhandled_rejections:!0,capture_console_errors:!1}',
    'captureExtensionExceptions:!1', 'exception_steps:{enabled:!1}', 'captured with value: |captured as exception: '])
    assert.ok(bundle.includes(piece), `public/analytics.js is missing ${piece}; run npm run build:analytics`);
});

test('the privacy page says PostHog receives anonymous error reports and how they are cleaned', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const privacy = html.match(/<section id="panel-privacy"[^>]*>([\s\S]*?)<\/section>/)[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const fact of ['sends PostHog anonymous error reports when a page goes wrong',
    'PostHog also receives anonymous error reports when something on a page goes wrong in your browser',
    'any quoted text is removed from the message', 'search terms and fragments are removed from any address in it',
    'Errors from browser extensions or other sites\' scripts are not sent', 'Google Analytics receives no error reports'])
    assert.ok(privacy.includes(fact), fact);
  assert.doesNotMatch(privacy, /never receive[^.]*error messages/);
  assert.doesNotMatch(privacy, /\u2014/);
});
