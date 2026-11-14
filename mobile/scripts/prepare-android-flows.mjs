#!/usr/bin/env node
// Android preparation preserves YAML comments, including declared tap budgets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments, isSeq } from 'yaml';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(mobile, '.maestro');
const argv = process.argv.slice(2);
const output = argv[0];
if (!output)
  throw new Error(
    'Usage: prepare-android-flows.py <output> [--overrides <dir>] [--coverage]',
  );
const settings = {
  '13b-today-no-edition': 'OPAX_FIXTURE_EDITION=absent',
  '13c-today-edition-withdrawn': 'OPAX_FIXTURE_EDITION=withdrawn',
  '13g-today-first-install': 'OPAX_NETWORK_PROFILE=throttled',
  '26-follows': 'OPAX_FIXTURE_DATA=changed',
  '28g-vacant-seat': 'OPAX_FIXTURE_ROSTER=vacant',
  '30-catalog-robustness': 'OPAX_FIXTURE_ROSTER=null-optional',
};
if (argv.includes('--settings')) {
  console.log(settings[argv[argv.indexOf('--settings') + 1]] ?? '');
  process.exit(0);
}
const helpers = new Set([
  '06-open-profile.yaml',
  '08-open-profile.yaml',
  'review-pages.yaml',
  'search-keyboard-reveal.yaml',
  'search-submit-reveal.yaml',
]);
const specialReasons = {
  '70-vic-election.yaml':
    'Election clock links, Android seat chooser and Back dismissal of the page menu',
  '03-mp-profile.yaml': 'Native Sources navigation and profile share action',
  '32-record-reader.yaml':
    'Android Back, cold citation link and exact native clipboard audit',
  '12-search-keyboard.yaml':
    'Inline Search field, IME submit, repeat and Back dismissal',
  '07-scene-lifecycle.yaml':
    'Cold/warm app links and native Android share sheet',
};
const special = new Set(Object.keys(specialReasons));
const notApplicable = (name) => {
  if (/^(52-|53-|54-|55b-|56-|57b-)/.test(name))
    return 'iPad split panes, presentation or viewport; no Android tablet parity claim';
  if (/^(28-welcome|28-welcome-ax5|28c-welcome-not-now)\.yaml$/.test(name))
    return 'iOS-only: the OPAXWelcomeTour launch argument opens the welcome on iOS; Android ignores it and has no launch-argument path';
  if (name === 'release-community-hidden.yaml')
    return 'Production-only hidden-Community check needs a production binary; e2e deliberately includes fixture routes';
  return null;
};
const held = (name) => /^(23-|24-)/.test(name);
const permission = {
  'Allow Once': {
    id: '.*permissioncontroller:id/permission_allow_one_time_button',
  },
  'Allow While Using App': {
    id: '.*permissioncontroller:id/permission_allow_foreground_only_button',
  },
  'Allow While Using the App': {
    id: '.*permissioncontroller:id/permission_allow_foreground_only_button',
  },
  'Don’t Allow': { id: '.*permissioncontroller:id/permission_deny_button' },
  "Don't Allow": { id: '.*permissioncontroller:id/permission_deny_button' },
  'Precise.*On': { text: '(?i)^(Approximate|Approximate location)$' },
  // Android keeps a fixed radio label rather than iOS’s On/Off label. The
  // shared flow then asserts location-approximate after granting access.
  'Precise.*Off': { text: '(?i)^(Approximate|Approximate location)$' },
};
// System ANR titles other than the app's own (which stays a failure).
const systemAnr =
  "^(?!OPAX )(System UI|Process system|Pixel Launcher|.*[Ss]ystem.*|Google .*) (isn't|is not) responding$";
const backSelector = { text: '^(Navigate up|Go back|Back|Back to .*)$' };
// Android's native SearchView adds leading spaces to its hint. Its stable
// resource id also works once the hint has been replaced by entered text.
const nativeSearchHints = new Set([
  'Electorate or member.s name',
  'Electorate, member or state',
  'District, region or member.s name',
  'Bills, sponsors and portfolios',
  'Name or photographer',
  'Bill names',
  'Name, electorate or state',
  'Party name',
  'Member.s name',
  'Datasets and publishers',
]);
const nativeSearch = { id: '.*:id/search_src_text' };
// Flows whose `tapOn: OK` closes the e2e source destination, with the source
// sheet row that may remain beneath it on Android.
const sourceDestinationSheets = {
  '11-bill-detail.yaml': 'bill-divisions-source-sheet-original-0',
};
function selector(v) {
  if (v === 'Search bills')
    return { id: '.*:id/(search_src_text|search_button)' };
  if (v === 'Profile sources') return 'Sources';
  if (v === 'Privacy policy-device') return { id: 'about-privacy-device' };
  if (nativeSearchHints.has(v)) return { ...nativeSearch };
  if (typeof v === 'string')
    return (
      permission[v] ??
      (v === 'People, bills, topics and more'
        ? { id: 'search-input' }
        : v.replaceAll('iPhone', 'phone'))
    );
  if (!v || typeof v !== 'object') return v;
  if (v.text === 'Privacy policy-device') {
    const { text, ...options } = v;
    return { ...options, id: 'about-privacy-device' };
  }
  // The redesigned suggestion list promotes an exact person match to Top
  // and deliberately omits its duplicate from the People group.
  if (v.id === 'search-suggestion-person-.*')
    return { ...v, id: 'search-(suggestion-person-.*|top-suggestion)' };
  // The same promotion applies to an exact topic match (61: "housing"); the
  // promoted row must still name the topic.
  if (v.id === 'search-suggestion-topic-housing')
    return {
      ...v,
      id: 'search-(suggestion-topic-housing|top-suggestion)',
      text: v.text ?? '^Housing(, .*)?$',
    };
  if (v.id?.endsWith('-elected') && v.text === 'Elected')
    return { ...v, text: '^(Status: )?Elected$' };
  if (nativeSearchHints.has(v.text)) {
    const { text, ...options } = v;
    return { ...options, ...nativeSearch };
  }
  if (v.id === 'BackButton')
    return { ...backSelector, ...(v.optional ? { optional: true } : {}) };
  if (permission[v.text])
    return { ...permission[v.text], ...(v.optional ? { optional: true } : {}) };
  if (v.text === 'People, bills, topics and more')
    return { id: 'search-input' };
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => [
      k,
      k === 'text' && typeof x === 'string'
        ? x.replaceAll('iPhone', 'phone')
        : x,
    ]),
  );
}
function androidURL(value) {
  // Deliver web route families to the app's shared resolver without opening
  // a production browser. Android verified HTTPS App Links are separate work.
  return typeof value === 'string'
    ? value.replace(/^https:\/\/opax\.(?:com\.au|invalid)(?:\/|$)/, 'opax://')
    : value;
}
function command(v, relative) {
  if (typeof v === 'string') {
    if (v === 'pressKey: Back') return 'back';
    return v;
  }
  if (!v || typeof v !== 'object') return v;
  const out = structuredClone(v);
  if (out.scrollUntilVisible)
    // A headless Android scroll can expose the target just as Maestro's
    // default 20-second deadline expires. Retain longer explicit waits.
    out.scrollUntilVisible.timeout = Math.max(
      out.scrollUntilVisible.timeout ?? 20000,
      90000,
    );
  if (
    out.pressKey === 'Enter' &&
    ['06-open-profile.yaml', '08-open-profile.yaml'].includes(relative)
  )
    return {
      runFlow: {
        commands: [
          {
            extendedWaitUntil: {
              visible: { id: 'search-top-suggestion', text: '${NAME}.*' },
              timeout: 90000,
            },
          },
          out,
        ],
      },
    };
  if (
    out.inputText &&
    ['support/search-query.yaml', '06-open-profile.yaml'].includes(relative)
  ) {
    const variable = relative === '06-open-profile.yaml' ? 'NAME' : 'QUERY';
    return {
      runFlow: {
        commands: [
          out,
          {
            extendedWaitUntil: {
              visible: {
                id: 'search-speeches-row',
                text: '${"Search speeches for “" + ' + variable + ' + "”"}',
              },
              timeout: 60000,
            },
          },
        ],
      },
    };
  }
  if (out.openLink) {
    if (typeof out.openLink === 'string')
      out.openLink = androidURL(out.openLink);
    else out.openLink.link = androidURL(out.openLink.link);
  }
  if (out.runFlow?.env)
    for (const key of ['URL', 'ROOT_URL'])
      if (out.runFlow.env[key])
        out.runFlow.env[key] = androidURL(out.runFlow.env[key]);
  if (out.pressKey === 'Back') return 'back';
  if (out.tapOn) {
    const tap = out.tapOn;
    const text = typeof tap === 'string' ? tap : tap.text;
    // e2e builds draw a source's destination as the Original page, which
    // Android leaves with Back; then leave the Android Sources page if it
    // remains (as android/03-mp-profile.yaml does).
    if (text === 'OK' && sourceDestinationSheets[relative])
      return {
        runFlow: {
          commands: [
            { assertVisible: { id: 'source-destination-url' } },
            'back',
            {
              runFlow: {
                when: { visible: { id: sourceDestinationSheets[relative] } },
                commands: ['back'],
              },
            },
          ],
        },
      };
    // Android has no inline calendar: the system date dialog takes the day
    // and its OK; the sheet's row then shows the chosen date.
    if (
      text === '2|Tuesday, 2 January.*' &&
      relative === '45-directory-history.yaml'
    )
      return {
        runFlow: {
          commands: [
            { tapOn: { text: '(Tue(sday)?, )?0?2 January 2024|2' } },
            { tapOn: { id: 'android:id/button1' } },
            {
              extendedWaitUntil: {
                visible: {
                  id: 'electorate-date-open',
                  text: 'Date, 2 January 2024',
                },
                timeout: 15000,
              },
            },
          ],
        },
      };
    // The date sheet's Done is its leading close button (header-done) on
    // Android; it applies the date. Any other Done in 45 closes by Back.
    if (text === 'Done' && relative === '45-directory-history.yaml')
      return {
        runFlow: {
          commands: [
            {
              runFlow: {
                when: { notVisible: { id: 'electorate-date-sheet' } },
                commands: ['back'],
              },
            },
            {
              runFlow: {
                when: { visible: { id: 'electorate-date-sheet' } },
                commands: [{ tapOn: { id: 'header-done' } }],
              },
            },
          ],
        },
      };
    if (relative === 'support/search-scope.yaml' && text === '^${SCOPE}$')
      return { tapOn: { id: 'search-scope-${SCOPE.toLowerCase()}' } };
    if (
      nativeSearchHints.has(text) ||
      (text === 'Name' && relative === '43-money-agencies.yaml')
    )
      return {
        runFlow: {
          commands: [
            {
              tapOn: {
                ...(typeof tap === 'object' ? tap : {}),
                id: '.*:id/(search_src_text|search_button)',
                text: undefined,
              },
            },
            { extendedWaitUntil: { visible: nativeSearch, timeout: 15000 } },
          ],
        },
      };
    // Only navigation dismissals: editing Done and action-sheet cancellation
    // remain real taps. Follows Done exits edit mode and must also remain a tap.
    if (
      tap.id === 'BackButton' ||
      text === 'Back' ||
      text === 'Today' ||
      (text === 'Done' &&
        !relative.includes('26-follows') &&
        !relative.includes('quiz-number-done'))
    )
      return 'back';
    if (
      text === 'Cancel' &&
      /^(07-your-mp|13e-|24-electorate-map-cancel)/.test(relative)
    )
      return {
        runFlow: {
          commands: [
            {
              runFlow: {
                when: {
                  visible: {
                    id: '.*inputmethod.*:id/(keyboard_holder|input_view)',
                  },
                },
                commands: ['back'],
              },
            },
            'back',
            {
              runFlow: {
                when: { visible: { id: 'seat-sheet' } },
                commands: ['back'],
              },
            },
          ],
        },
      };
    if (text === 'Cancel' && relative === '22b-sources.yaml')
      return 'hideKeyboard';
    if (text === 'Open' && tap.optional)
      return {
        runFlow: {
          when: { visible: { text: '^Open$' } },
          commands: [{ tapOn: { text: '^Open$' } }],
        },
      };
    out.tapOn =
      text === 'Select All'
        ? { text: '^Select (All|all)$' }
        : text === 'Ask about their speeches' ||
            (text === 'Ask about Anthony Albanese' &&
              relative === '30-ask-entry-points.yaml')
          ? // Android's More menu names the person ("Ask about <name>").
            { text: '^Ask about (their speeches|.+)$' }
          : text === 'Name' && relative === '43-money-agencies.yaml'
            ? { ...nativeSearch }
            : selector(tap);
    if (
      out.tapOn?.id?.endsWith('/permission_allow_one_time_button') &&
      !relative.includes('approximate')
    )
      return {
        runFlow: {
          commands: [
            {
              runFlow: {
                when: { visible: { text: '(?i)^(Precise|Precise location)$' } },
                commands: [
                  { tapOn: { text: '(?i)^(Precise|Precise location)$' } },
                ],
              },
            },
            { tapOn: out.tapOn },
          ],
        },
      };
    if (out.tapOn?.id?.startsWith('tab-')) {
      out.tapOn.retryTapIfNoChange = true;
      // A tab tap during a busy warm-up can be dropped while other UI still
      // changes. Confirm the bottom tab is selected, re-tapping once.
      if (/^tab-[a-z-]+$/.test(out.tapOn.id)) {
        const tab = { id: out.tapOn.id, selected: true };
        return {
          runFlow: {
            commands: [
              out,
              {
                runFlow: {
                  when: { notVisible: { ...tab } },
                  commands: [
                    { waitForAnimationToEnd: { timeout: 5000 } },
                    { tapOn: { id: out.tapOn.id } },
                  ],
                },
              },
              { extendedWaitUntil: { visible: { ...tab }, timeout: 30000 } },
            ],
          },
        };
      }
    }
  }
  if (out.assertVisible?.id === 'electorate-date-picker')
    return {
      runFlow: {
        commands: [
          { tapOn: { id: 'electorate-date-open' } },
          {
            extendedWaitUntil: {
              visible: { id: 'android:id/button1' },
              timeout: 15000,
            },
          },
        ],
      },
    };
  if (
    out.assertVisible === 'Cancel' &&
    relative === '24-electorate-map-cancel.yaml'
  )
    out.assertVisible = backSelector;
  if (out.assertVisible?.id === 'today-bills' && /^(13b-|13c-)/.test(relative))
    return {
      runFlow: {
        // Android exposes only the viewport in its accessibility hierarchy.
        // Check the bills block, then restore the top for the no-edition and
        // daily-pair checks, rather than assuming all three blocks fit.
        commands: [
          {
            scrollUntilVisible: { element: out.assertVisible, timeout: 90000 },
          },
          { assertVisible: out.assertVisible },
          {
            scrollUntilVisible: {
              element: { id: 'today-screen-message' },
              direction: 'UP',
              timeout: 90000,
            },
          },
        ],
      },
    };
  if (out.assertVisible?.id === 'search-scope.*')
    return {
      runFlow: {
        commands: [
          {
            scrollUntilVisible: {
              element: { id: 'search-scope.*' },
              direction: 'UP',
              timeout: 30000,
            },
          },
          { assertVisible: out.assertVisible },
        ],
      },
    };
  if (
    relative === '13e-today-invitation.yaml' &&
    out.assertVisible?.id === 'use-my-location'
  )
    // The invitation starts locating immediately. Android exposes the busy
    // row rather than an idle action while that request is outstanding.
    out.assertVisible = { id: 'seat-location-finding' };
  for (const key of [
    'assertVisible',
    'assertNotVisible',
    'copyTextFrom',
    'longPressOn',
  ])
    if (out[key]) out[key] = selector(out[key]);
  if (out.extendedWaitUntil)
    for (const key of ['visible', 'notVisible'])
      if (out.extendedWaitUntil[key])
        out.extendedWaitUntil[key] = selector(out.extendedWaitUntil[key]);
  if (out.scrollUntilVisible) {
    out.scrollUntilVisible.element = selector(out.scrollUntilVisible.element);
    if (['05-workbench.yaml', '06-open-profile.yaml'].includes(relative))
      out.scrollUntilVisible.timeout = 300000;
    if (out.scrollUntilVisible.element?.id === 'search-input')
      delete out.scrollUntilVisible.centerElement;
    // System permission buttons fit their dialog; never swipe the OS dialog.
    if (out.scrollUntilVisible.element?.id?.includes('permissioncontroller'))
      return {
        extendedWaitUntil: {
          visible: out.scrollUntilVisible.element,
          timeout: 15000,
        },
      };
  }
  if (out.swipe?.from && relative === '31-ask-saved.yaml')
    return { longPressOn: { text: out.swipe.from } };
  if (
    relative === '30-ask.yaml' &&
    out.swipe?.start === '50%, 30%' &&
    out.swipe?.end === '50%, 90%'
  )
    return 'hideKeyboard';
  const swipe = out.swipe;
  if (swipe?.start && swipe.end) {
    const start = swipe.start.split(',').map(parseFloat),
      end = swipe.end.split(',').map(parseFloat);
    if (start[0] <= 5 && end[0] >= 75 && Math.abs(start[1] - end[1]) < 15)
      return 'back';
  }
  for (const key of ['runFlow', 'repeat', 'retry']) {
    if (out[key]?.commands)
      out[key].commands = out[key].commands.map((c) => command(c, relative));
    if (out[key]?.when)
      for (const check of ['visible', 'notVisible'])
        if (out[key].when[check])
          out[key].when[check] = selector(out[key].when[check]);
  }
  return out;
}
function prepare(body, relative) {
  const docs = parseAllDocuments(body, { compat: 'yaml-1.1' });
  for (const doc of docs) {
    if (doc.errors.length)
      throw new Error(
        `${relative}: ${doc.errors.map((e) => e.message).join('; ')}`,
      );
    if (!isSeq(doc.contents)) continue;
    function steps(seq) {
      const result = [];
      for (const node of seq.items) {
        const before = node.toJSON();
        const after = command(before, relative);
        const next = doc.createNode(after);
        next.commentBefore = node.commentBefore;
        next.comment = node.comment;
        result.push(next);
        if (before === 'launchApp' || before?.launchApp) {
          // A cold headless Pixel may show its launcher ANR over the app.
          // Close that system launcher only; app ANRs remain test failures.
          result.push(
            doc.createNode({
              runFlow: {
                when: { visible: "^Pixel Launcher (isn't|is not) responding$" },
                commands: [{ tapOn: { text: '^Close app$' } }],
              },
            }),
          );
          // A busy headless emulator can also report System UI or the
          // system process as not responding. Wait on any such system
          // dialog (never OPAX's own), a few times if it reappears.
          result.push(
            doc.createNode({
              repeat: {
                while: { visible: systemAnr },
                times: 3,
                commands: [
                  { tapOn: { text: '^Wait$' } },
                  { waitForAnimationToEnd: { timeout: 5000 } },
                ],
              },
            }),
          );
          result.push(
            doc.createNode({ waitForAnimationToEnd: { timeout: 5000 } }),
          );
          // Readiness is based on the mounted root, not the current tab. A
          // relaunch may restore a detail or welcome screen rather than Today.
          const root = {
            id: 'today-screen|welcome-screen|person-screen-title|ask-screen|bill-screen|talk-sheet|search-screen',
          };
          // A system ANR can also appear after the check above; keep
          // waiting it out until the root shows, then require the root.
          result.push(
            doc.createNode({
              repeat: {
                while: { notVisible: { ...root } },
                times: 4,
                commands: [
                  {
                    runFlow: {
                      when: { visible: systemAnr },
                      commands: [{ tapOn: { text: '^Wait$' } }],
                    },
                  },
                  {
                    extendedWaitUntil: {
                      visible: { ...root },
                      timeout: 10000,
                      optional: true,
                    },
                  },
                ],
              },
            }),
          );
          result.push(
            doc.createNode({
              extendedWaitUntil: { visible: { ...root }, timeout: 30000 },
            }),
          );
        }
      }
      seq.items = result;
    }
    steps(doc.contents);
  }
  return docs
    .map((d) => {
      d.directives.docStart = false;
      return d.toString({ lineWidth: 0 });
    })
    .join('---\n');
}
function files(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(root, e.name);
    return e.isDirectory()
      ? ['results', 'screenshots', 'recordings'].includes(e.name)
        ? []
        : files(full)
      : [full];
  });
}
fs.mkdirSync(output, { recursive: true });
// Clear only previously generated files recorded by this preparer. Stale
// overrides must not silently enter a later run.
const manifest = path.join(output, 'prepared-files.json');
if (fs.existsSync(manifest))
  for (const name of JSON.parse(fs.readFileSync(manifest, 'utf8'))) {
    const full = path.resolve(output, name);
    if (full.startsWith(path.resolve(output) + path.sep))
      fs.rmSync(full, { force: true });
  }
const written = [];
for (const original of files(source)) {
  if (!/\.(yaml|js|json)$/.test(original)) continue;
  const relative = path.relative(source, original);
  const target = path.join(output, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    original.endsWith('.yaml')
      ? prepare(fs.readFileSync(original, 'utf8'), relative)
      : fs.readFileSync(original),
  );
  written.push(relative);
}
// Android helper replacements occupy the same relative paths as their shared
// callers. Root geometry helpers have no support/ prefix in the iOS suite.
for (const name of [
  'back',
  'restore-tab-bar',
  'search-dismiss',
  'search-keyboard-reveal',
  'search-submit-reveal',
  'ask-progress-geometry',
  'quiz-number-done',
]) {
  const relative =
    (name.startsWith('search-') && name.endsWith('-reveal') ? '' : 'support/') +
    name +
    '.yaml';
  fs.copyFileSync(
    path.join(output, 'android/support', name + '.yaml'),
    path.join(output, relative),
  );
}
const plan = fs
  .readdirSync(source)
  .filter((n) => n.endsWith('.yaml'))
  .sort()
  .map((name) => {
    const category = notApplicable(name)
      ? 'not applicable'
      : held(name)
        ? 'held: map lane'
        : special.has(name)
          ? 'Android-only variant'
          : 'prepared variant';
    return {
      shared: name,
      path: special.has(name) ? `android/${name}` : name,
      category,
      run: !notApplicable(name) && !held(name) && !helpers.has(name),
      reason:
        notApplicable(name) ??
        (held(name)
          ? 'held: map lane; permission mapping is prepared here for that lane'
          : helpers.has(name)
            ? 'Parameterised helper; exercised by parent journeys'
            : special.has(name)
              ? specialReasons[name]
              : 'Shared assertions; prepared Android Back, permission selectors and launch waits'),
      settings: settings[name.slice(0, -5)] ?? '',
    };
  });
if (argv.includes('--overrides')) {
  const overrides = argv[argv.indexOf('--overrides') + 1];
  for (const original of files(overrides)) {
    if (!/\.(yaml|js|json)$/.test(original)) continue;
    const relative = path.relative(overrides, original),
      target = path.join(output, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(original, target);
    written.push(relative);
  }
}
fs.writeFileSync(
  path.join(output, 'suite.json'),
  JSON.stringify(plan, null, 2) + '\n',
);
fs.writeFileSync(manifest, JSON.stringify(written, null, 2) + '\n');
if (argv.includes('--coverage')) {
  const counts = {};
  for (const row of plan)
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  const body =
    '# Android Maestro coverage\n\nGenerated by `python3 scripts/prepare-android-flows.py <private-output> --coverage`.\n' +
    'One row per shared root flow; support helpers are exercised through their callers.\n' +
    'Prepared means the Android file is generated and audited; device pass/fail is recorded privately per API.\n' +
    'No shared iOS YAML is changed. Font-scale variants run at Android 2.0.\n\n' +
    'The cold first-line flow (15) defaults to 2.0; OPAX_ANDROID_FONT_SCALE=1.0 runs its standard-size control. Other normal flows default to 1.0; named ax5 variants use 2.0. Each run records font-scales.tsv.\n\n' +
    'On Linux, OPAX_ANDROID_PRIVATE_ADB=1 uses a new owned Unix-socket server when shared adb is unavailable. Emulator scanning and wireless auto-connect are disabled; the USB filter accepts only the assigned emulator serial. Only that emulator is registered. Cleanup stops the owned server by PID and leaves shared adb untouched. See the [ADB socket options](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/docs/user/adb.1.md).\n\n' +
    Object.entries(counts)
      .map(([k, v]) => `${k}: **${v}**`)
      .join('; ') +
    `. Total: **${plan.length}**.\n\n` +
    'The full device set is selected with `scripts/e2e-android.sh OPAX_API34 --all-android`.\n' +
    'The runner changes fixture variants per flow; 04 requires a saved-catalog warmup then the fixture stopped.\n' +
    'Today/welcome launch flags require Android support in the app; assertions stay mandatory.\n' +
    'Money web-path cases enter the shared resolver through opax://; Android verified HTTPS App Links remain navigation work and are not claimed by these fixture runs.\n' +
    'Permission taps use Android permission-controller resource IDs across API 34/36: Only this time, While using the app/this app and Don’t allow. Precise/Approximate choices accept the location suffix.\n' +
    'R8 mapping and native symbols are release checks only when enabled by the generated native build.\n\n' +
    '| Shared flow | Android coverage | Prepared entry / reason |\n| --- | --- | --- |\n' +
    plan
      .map(
        (p) =>
          `| \`${p.shared}\` | ${p.category} | \`${p.path}\`: ${p.reason}${p.settings ? '; `' + p.settings + '`' : ''} |`,
      )
      .join('\n') +
    '\n';
  fs.writeFileSync(path.join(source, 'android/COVERAGE.md'), body);
}
console.log(
  `Prepared ${written.length} Android flow/support files in ${output}; ${plan.filter((p) => p.run).length} runnable journeys.`,
);
