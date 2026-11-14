#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseAllDocuments } from 'yaml';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'opax-android-flows-'));
const shared = fs
  .readdirSync(path.join(mobile, '.maestro'))
  .filter((n) => n.endsWith('.yaml'));
const before = shared.map((n) =>
  fs.readFileSync(path.join(mobile, '.maestro', n), 'utf8'),
);
execFileSync('python3', [
  path.join(mobile, 'scripts/prepare-android-flows.py'),
  out,
]);
process.on('exit', () => fs.rmSync(out, { recursive: true, force: true }));
const plan = JSON.parse(fs.readFileSync(path.join(out, 'suite.json'), 'utf8'));
const read = (name) =>
  parseAllDocuments(fs.readFileSync(path.join(out, name), 'utf8'));
function walk(value, visit) {
  visit(value);
  if (Array.isArray(value)) for (const child of value) walk(child, visit);
  else if (value && typeof value === 'object')
    for (const child of Object.values(value)) walk(child, visit);
}

test('every shared flow has exactly one coverage row and runnable entries exist', () => {
  assert.equal(plan.length, shared.length);
  assert.deepEqual(new Set(plan.map((p) => p.shared)), new Set(shared));
  for (const p of plan)
    assert.ok(fs.existsSync(path.join(out, p.path)), p.path);
  assert.equal(plan.filter((p) => p.category === 'held: map lane').length, 8);
  for (const name of [
    '52-ipad-foundation',
    '53-ipad-split',
    '54-ipad-rest',
    '55b-ipad-bill-sponsor',
    '56-ipad-welcome',
    '57b-ipad-feedback-b32',
  ])
    assert.equal(
      plan.find((p) => p.shared === name + '.yaml').category,
      'not applicable',
    );
  for (const name of ['55-bill-sponsor.yaml', '57-feedback-b32.yaml'])
    assert.ok(plan.find((p) => p.shared === name).run);
});

test('native search selectors tolerate Android SearchView hint padding', () => {
  for (const name of [
    'support/location-manual-seat.yaml',
    '07-state-seat.yaml',
    '07-your-mp.yaml',
    '09-electorate.yaml',
    '22b-sources.yaml',
    '43-money-agencies.yaml',
  ]) {
    const body = JSON.stringify(read(name)[1].toJS());
    assert.ok(body.includes('.*:id/search_src_text'), name);
    assert.ok(!body.includes('Electorate or member.s name'), name);
  }
  for (const name of ['06-open-profile.yaml', '08-open-profile.yaml']) {
    const body = JSON.stringify(read(name)[1].toJS());
    assert.ok(body.includes('search-top-suggestion'), name);
    assert.ok(body.includes('${NAME}.*'), name);
  }
  assert.ok(
    JSON.stringify(read('10-bills.yaml')[1].toJS()).includes(
      '.*:id/(search_src_text|search_button)',
    ),
  );
  assert.ok(
    JSON.stringify(read('09-electorate.yaml')[1].toJS()).includes(
      '^(Status: )?Elected$',
    ),
  );
});

test('the election journey selects its Android twin with clock links', () => {
  const row = plan.find((p) => p.shared === '70-vic-election.yaml');
  assert.equal(row.path, 'android/70-vic-election.yaml');
  assert.equal(row.category, 'Android-only variant');
  assert.equal(row.run, true);
  const body = JSON.stringify(read(row.path)[1].toJS());
  for (const phase of ['ahead', 'today', 'closed'])
    assert.ok(body.includes(`fixture=${phase}`));
  assert.ok(!body.includes('OPAXVicElection'));
  assert.ok(plan.some((p) => p.shared === '69-money-map-v2.yaml'));
});

test('all prepared YAML parses as two documents, with bounded support references', () => {
  for (const name of JSON.parse(
    fs.readFileSync(path.join(out, 'prepared-files.json'), 'utf8'),
  ).filter((n) => n.endsWith('.yaml'))) {
    const docs = read(name);
    assert.equal(docs.length, 2, name);
    for (const doc of docs)
      assert.equal(doc.errors.length, 0, `${name}: ${doc.errors}`);
    assert.ok(Array.isArray(docs[1].toJS()), name);
    walk(docs[1].toJS(), (node) => {
      if (!node || typeof node !== 'object') return;
      const reference =
        typeof node.runFlow === 'string' ? node.runFlow : node.runFlow?.file;
      if (reference && !reference.includes('${'))
        assert.ok(
          fs.existsSync(path.resolve(out, path.dirname(name), reference)),
          name + ': ' + reference,
        );
    });
  }
});

test('API 34 and 36 use permission-controller ids, preserving once, foreground, deny and approximate intent', () => {
  const permissionFlows = plan.filter((p) =>
    /^(24-|28-welcome.yaml|28e-)/.test(p.shared),
  );
  for (const p of permissionFlows) {
    const body = JSON.stringify(read(p.shared)[1].toJS());
    assert.ok(
      !/Allow Once|Allow While Using|Don’t Allow|Precise\.\*On/.test(body),
      p.shared,
    );
  }
  for (const api of [34, 36]) {
    const pkg =
      api === 34
        ? 'com.google.android.permissioncontroller'
        : 'com.android.permissioncontroller';
    const body = JSON.stringify(
      read('28e-no-permission-at-launch.yaml')[1].toJS(),
    );
    for (const id of [
      'permission_allow_one_time_button',
      'permission_allow_foreground_only_button',
      'permission_deny_button',
    ]) {
      const regex = new RegExp('.*permissioncontroller:id/' + id);
      assert.ok(regex.test(pkg + ':id/' + id));
      assert.ok(body.includes(id));
    }
  }
  const approximate = JSON.stringify(
    read('24-electorate-map-approximate.yaml')[1].toJS(),
  );
  assert.ok(
    approximate.includes('Approximate location') &&
      approximate.includes('permission_allow_one_time_button'),
  );
  const cancel = JSON.stringify(
    read('24-electorate-map-cancel.yaml')[1].toJS(),
  );
  assert.ok(cancel.includes('back') && !cancel.includes('permission_allow_'));
  assert.ok(cancel.includes('keyboard_holder'));
  assert.ok(!cancel.includes('hideKeyboard'));
});

test('Android copies replace iOS back actions and UIKit probes without changing shared bytes', () => {
  for (const p of plan.filter((p) => p.run)) {
    const body = JSON.stringify(read(p.path)[1].toJS());
    assert.ok(!body.includes('BackButton'), p.path);
  }
  for (const n of [
    'search-keyboard-reveal.yaml',
    'search-submit-reveal.yaml',
    'support/ask-progress-geometry.yaml',
  ])
    assert.ok(
      !JSON.stringify(read(n)[1].toJS()).includes('search-geometry'),
      n,
    );
  shared.forEach((n, i) =>
    assert.equal(
      fs.readFileSync(path.join(mobile, '.maestro', n), 'utf8'),
      before[i],
    ),
  );
  execFileSync('node', [
    path.join(mobile, 'scripts/maestro-tap-budget.mjs'),
    path.join(out, '66-my-mp-journey.yaml'),
    path.join(out, '67-my-mp-entry-points.yaml'),
  ]);
});

test('Android support/back.yaml is the back key, not the iOS back button tap', () => {
  // Flows call support/back.yaml; the iOS copy taps BackButton or the bar's
  // title, which Android does not have.
  const [header, steps] = read('support/back.yaml').map((d) => d.toJS());
  assert.equal(header.name, 'Android go back one screen with the back key');
  assert.deepEqual(steps, ['back']);
});

test('prepared launch values retain string semantics in Maestro YAML 1.1', () => {
  for (const name of [
    '66-my-mp-journey.yaml',
    '28-welcome.yaml',
    '65-money-links.yaml',
  ]) {
    const body = fs.readFileSync(path.join(out, name), 'utf8');
    assert.deepEqual(
      parseAllDocuments(body, { schema: 'yaml-1.1' }).map((d) => d.toJS()),
      read(name).map((d) => d.toJS()),
    );
  }
});

test('Android root restoration does not press Back through hideKeyboard and web path cases stay local', () => {
  assert.notEqual(
    read('support/restore-tab-bar.yaml')[1].toJS()[0],
    'hideKeyboard',
  );
  const money = read('65-money-links.yaml')[1].toJS();
  assert.ok(money.length > 20);
  for (const step of money) {
    const url = step.runFlow?.env?.URL;
    if (url) assert.ok(url.startsWith('opax://'), url);
  }
  const invitation = JSON.stringify(
    read('13e-today-invitation.yaml')[1].toJS(),
  );
  assert.ok(invitation.includes('seat-location-finding'));
  assert.ok(!invitation.includes('use-my-location'));
  const about = JSON.stringify(read('14-about.yaml')[1].toJS());
  assert.ok(about.includes('about-privacy-device'));
  assert.ok(!about.includes('Privacy policy-device'));
  const voice = read('20-voice-bridge.yaml')[1].toJS();
  const state = voice.find(
    (step) => step.scrollUntilVisible?.element?.id === 'voice-state',
  );
  assert.equal(state.scrollUntilVisible.timeout, 90000);
});

test('cold launches dismiss only named system ANR dialogs', () => {
  const body = fs.readFileSync(path.join(out, '01-launch.yaml'), 'utf8');
  assert.ok(body.includes("^Pixel Launcher (isn't|is not) responding$"));
  assert.ok(body.includes('^Wait$'));
  const anr = new RegExp(
    body.match(/visible: (\^\(\?!OPAX .*responding\$)/)[1],
  );
  for (const title of [
    "System UI isn't responding",
    "Process system isn't responding",
    "Pixel Launcher isn't responding",
  ])
    assert.ok(anr.test(title), title);
  assert.ok(!anr.test("OPAX isn't responding"));
});

test('bottom tab taps are confirmed by the selected tab', () => {
  const body = fs.readFileSync(path.join(out, '02-search.yaml'), 'utf8');
  assert.match(body, /notVisible:\n\s+id: tab-search\n\s+selected: true/);
  assert.match(
    body,
    /extendedWaitUntil:\n\s+visible:\n\s+id: tab-search\n\s+selected: true/,
  );
});

test('cold-launch readiness keeps waiting out system ANRs before requiring the root', () => {
  const steps = read('27-leads.yaml')[1].toJS();
  const loop = steps.find((s) => s.repeat?.while?.notVisible);
  assert.ok(loop, 'readiness loop');
  assert.equal(loop.repeat.commands[1].extendedWaitUntil.optional, true);
  const i = steps.indexOf(loop);
  assert.ok(steps[i + 1].extendedWaitUntil.visible.id.includes('today-screen'));
});

test('the profile More menu Ask action accepts the Android person label', () => {
  const body = fs.readFileSync(
    path.join(out, '30-ask-entry-points.yaml'),
    'utf8',
  );
  assert.ok(body.includes('^Ask about (their speeches|.+)$'));
});

test('an exact topic match may be promoted to the top suggestion', () => {
  const body = fs.readFileSync(
    path.join(out, '61-search-to-source.yaml'),
    'utf8',
  );
  assert.ok(body.includes('search-(suggestion-topic-housing|top-suggestion)'));
  assert.ok(!/id: search-suggestion-topic-housing\n/.test(body));
});
