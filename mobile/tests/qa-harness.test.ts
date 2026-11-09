import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const maestroSteps = (file: string) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        'process.stdout.write(JSON.stringify(require("yaml").parseAllDocuments(require("fs").readFileSync(process.argv[1], "utf8"))[1].toJS()))',
        file,
      ],
      { encoding: 'utf8' },
    ),
  );

describe('Maestro startup budgets', () => {
  // Evaluate only the real configuration block, before any device work.
  const runner = readFileSync('scripts/e2e.sh', 'utf8');
  const block = runner
    .slice(runner.indexOf('export OPAX_MAESTRO_STARTUP_TIMEOUT_SECONDS='))
    .split('SIZE=')[0]!;
  const budget = (server = '', driver = '') =>
    spawnSync(
      '/bin/bash',
      [
        '-c',
        `${block}\nprintf '%s %s' "$OPAX_MAESTRO_STARTUP_TIMEOUT_SECONDS" "$MAESTRO_DRIVER_STARTUP_TIMEOUT"`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          OPAX_MAESTRO_STARTUP_TIMEOUT_SECONDS: server,
          MAESTRO_DRIVER_STARTUP_TIMEOUT: driver,
        },
      },
    );
  test.each([
    ['', '', '180 360000'],
    ['235', '', '235 415000'],
    ['090', '', '90 270000'],
    ['235', '0600000', '235 600000'],
  ])('server %j and CLI %j resolve to %s', (server, driver, expected) => {
    const result = budget(server, driver);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(expected);
  });
  test.each(['0', '-1', '1.5', 'SECONDS+1', '$(exit 99)', '9999999999999'])(
    'invalid CLI milliseconds %j fail before device work',
    (driver) => {
      const result = budget('', driver);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('positive integer in milliseconds');
    },
  );
});

test('screens 4.26.0 patch applies cleanly and assigns menu and plain header ids last', () => {
  const version = JSON.parse(
    readFileSync('node_modules/react-native-screens/package.json', 'utf8'),
  ).version;
  expect(version).toBe('4.26.0');
  const file = 'node_modules/react-native-screens/ios/RNSBarButtonItem.mm';
  const patch = resolve('patches/react-native-screens+4.26.0.patch');
  const digest = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  // Accept pristine or previously patched installs, then verify the exact
  // upstream bytes before replay. No installed package is modified by this test.
  const upstream = readFileSync(file, 'utf8')
    .replace(/  \/\/ Menu and target\/action setup[^]*?(?=  return self;)/, '')
    .replace(
      /\n  if \(dict\[@"testID"\]\) \{\n    (self|menu|actionElement)\.accessibilityIdentifier = dict\[@"testID"\];\n  }\n/g,
      '',
    )
    .replace(
      '  UIMenu *menu = [UIMenu menuWithTitle:',
      '  return [UIMenu menuWithTitle:',
    )
    .replace('  return menu;\n', '\n');
  expect(digest(upstream)).toBe(
    'f6680e8d632552969582162782db40a5b20a7fa5ce36f1584bf4736c1b3547d3',
  );
  expect(digest(readFileSync(patch, 'utf8'))).toBe(
    '8b763ee16ec844d570af33facdddd3e2de57f696c966ea1e734c689a8ae6aae7',
  );
  const root = mkdtempSync(join(tmpdir(), 'screens-patch-'));
  try {
    const target = join(root, 'RNSBarButtonItem.mm');
    writeFileSync(target, upstream);
    for (const extra of [['--dry-run'], []]) {
      const result = spawnSync(
        '/usr/bin/patch',
        ['--batch', '--fuzz=0', '-p1', target, '-i', patch, ...extra],
        { encoding: 'utf8' },
      );
      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).not.toMatch(/offset|fuzz/i);
    }
    const source = readFileSync(target, 'utf8');
    expect(digest(source)).toBe(
      'd2ecac91610e46bb0a0fce42ceb61563326fd06fc886b4d769021aac1f553066',
    );
    const init = source.split('+ (void)resolveImageFromConfig')[0]!;
    expect(init).toContain(
      'NSString *testID = dict[@"testID"] ?: dict[@"identifier"];',
    );
    const idAt = init.indexOf('self.accessibilityIdentifier = testID;');
    expect(idAt).toBeGreaterThan(init.indexOf('self.menu ='));
    expect(idAt).toBeGreaterThan(init.indexOf('self.action ='));
    expect(init).toContain('self.menu.accessibilityIdentifier = testID;');
    for (const target of ['menu', 'actionElement'])
      expect(source).toContain(
        `${target}.accessibilityIdentifier = dict[@"testID"];`,
      );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Parse actual Maestro commands so selectors and gesture bounds are checked
// without starting Maestro, a fixture server or a simulator.
test('flow 27 bounds chrome recovery and the top fallback before searching down', () => {
  const steps = maestroSteps;
  const restore = steps('.maestro/support/restore-tab-bar.yaml');
  const gestures = restore.find(
    (step: any) => step.repeat?.while?.notVisible,
  )?.repeat;
  expect(gestures.while.notVisible).toEqual({ id: '${TAB_ID}' });
  expect(gestures.times).toBe(3);
  expect(gestures.times * gestures.commands.length).toBeLessThanOrEqual(6);
  expect(gestures.commands[0].swipe).toEqual({
    start: '97%, 60%',
    end: '97%, 45%',
    duration: 600,
  });
  expect(gestures.commands[1].swipe).toEqual({
    start: '97%, 30%',
    end: '97%, 85%',
    duration: 600,
  });
  const topTap = restore.findIndex(
    (step: any) => step.tapOn?.point === '50%, 1%',
  );
  expect(topTap).toBeGreaterThan(
    restore.findIndex((step: any) => step.assertVisible?.id === '${TAB_ID}'),
  );
  expect(restore[topTap + 1]).toEqual({
    waitForAnimationToEnd: { timeout: 5000 },
  });
  const fallback = restore[topTap + 2].repeat;
  expect(fallback.times).toBe(12);
  expect(fallback.while.notVisible).toEqual({ id: '${TOP_ID}' });
  expect(fallback.commands).toEqual([
    { swipe: { start: '97%, 30%', end: '97%, 85%', duration: 600 } },
  ]);
  expect(restore[topTap + 3]).toEqual({ assertVisible: { id: '${TOP_ID}' } });
  const repeats = restore
    .filter((step: any) => typeof step.repeat === 'object')
    .map((step: any) => step.repeat);
  expect(repeats).toHaveLength(3);
  for (const repeat of repeats) {
    expect(Number.isInteger(repeat.times)).toBe(true);
    expect(repeat.times).toBeGreaterThan(0);
    expect(repeat.times).toBeLessThanOrEqual(12);
  }
  const lead = steps('.maestro/27-leads.yaml');
  const returnAt = lead.findIndex(
    (step: any) => step.runFlow?.file === 'support/restore-tab-bar.yaml',
  );
  expect(lead[returnAt].runFlow.env).toEqual({
    TOP_ID: 'today-screen-message',
    TAB_ID: 'tab-today',
  });
  const declarations = lead
    .slice(returnAt)
    .find(
      (step: any) =>
        step.scrollUntilVisible?.element?.id === 'today-declarations-all',
    ).scrollUntilVisible;
  expect(declarations.direction).toBe('DOWN');
  const opening = lead.find(
    (step: any) => step.scrollUntilVisible?.element?.id === 'today-leads-open',
  ).scrollUntilVisible;
  expect(declarations.timeout).toBe(opening.timeout);
  expect(declarations.timeout).toBe(180000);
});

test('Ask idle excludes both options row ids without matching the composer Options button', () => {
  const steps = maestroSteps('.maestro/30-ask.yaml');
  const idle = steps.slice(
    0,
    steps.findIndex((step: any) => step.takeScreenshot),
  );
  expect(idle).toContainEqual({ assertNotVisible: { id: 'ask-options-line' } });
  expect(idle).toContainEqual({
    assertNotVisible: { id: 'ask-draft-new-conversation' },
  });
  expect(idle).not.toContainEqual({ assertNotVisible: { text: 'Options' } });
});

// Exercise the wait parser alone. No locks, build gates or devices are used.
test.each([
  ['', '7200'],
  ['7200', '7200'],
  ['090', '90'],
  ['0', '0'],
  ['-1', '7200'],
  ['10 seconds', '7200'],
  ['SECONDS+1', '7200'],
  ['1+1', '7200'],
  ['$(exit 99)', '7200'],
  ['99999999999999999999', '7200'],
])('pasteboard wait %j resolves safely to %s seconds', (input, expected) => {
  const value = execFileSync(
    '/bin/bash',
    [
      '-c',
      'OPAX_PASTE_WAIT_SECONDS=$1; source scripts/qa-lock.sh; qa_paste_lock_wait_seconds; printf "%s\\n" "$QA_PASTE_WAIT_SECONDS"',
      'wait-test',
      input,
    ],
    { encoding: 'utf8' },
  );
  expect(value.trim().split('\n')).toEqual([expected, expected]);
});

// The selection rule alone: no simulator, fixture or Maestro is started.
describe('journey selectors', () => {
  const check = (...selectors: string[]) =>
    spawnSync(
      '/bin/bash',
      [
        '-c',
        'source scripts/qa-flows.sh; qa_check_flow_selectors "$@"',
        'flows-test',
        ...selectors,
      ],
      { encoding: 'utf8' },
    );
  test('a bare 15 is refused with the explicit AX5 path', () => {
    const result = check('01', '15');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      'OPAX_CONTENT_SIZE=accessibility-extra-extra-extra-large scripts/e2e.sh <udid> .maestro/15-cold-first-line.yaml',
    );
  });
  test.each([
    [['.maestro/15-cold-first-line.yaml']],
    [['01', '05', '13', '14']],
    [['.maestro/13b-today-no-edition.yaml']],
    [[]],
  ])('selectors %j are accepted', (selectors) => {
    expect(check(...selectors).status).toBe(0);
  });
});

// The suite list alone, expanded by e2e.sh's own rule; nothing is started.
describe('iPhone suite', () => {
  const lines = (fn: string) =>
    execFileSync('/bin/bash', ['-c', `source scripts/qa-flows.sh; ${fn}`], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
  // A bare number is every NN-*.yaml but the two helpers e2e.sh skips.
  const expand = (selector: string) =>
    /^\d\d$/.test(selector)
      ? readdirSync('.maestro')
          .filter(
            (name) =>
              name.startsWith(`${selector}-`) &&
              name.endsWith('.yaml') &&
              !/-(open-profile|scene-lifecycle)\.yaml$/.test(name),
          )
          .sort()
          .map((name) => `.maestro/${name}`)
      : [selector];
  const suite = lines('qa_iphone_suite').flatMap(expand);
  const separate = lines('qa_iphone_separate_runs').map(
    (run) => /(\.maestro\/\S+\.yaml)$/.exec(run)![1]!,
  );

  test('every selector names journeys that exist, once each', () => {
    for (const selector of lines('qa_iphone_suite'))
      expect([selector, expand(selector).length > 0]).toEqual([selector, true]);
    for (const path of [...suite, ...separate])
      expect([path, existsSync(path)]).toEqual([path, true]);
    expect(new Set(suite).size).toBe(suite.length);
  });

  test('journey 21 runs as four flows, each in the suite', () => {
    expect(suite.filter((path) => path.startsWith('.maestro/21-'))).toEqual([
      '.maestro/21-talk-a-call.yaml',
      '.maestro/21-talk-b-controls.yaml',
      '.maestro/21-talk-c-allowance.yaml',
      '.maestro/21-talk-d-refusals.yaml',
    ]);
  });

  test('every numbered iPhone journey is in the suite or a separate run', () => {
    const waiting: string[] = [];
    const covered = new Set([...suite, ...separate, ...waiting]);
    const missing = readdirSync('.maestro')
      .filter((name) => /^\d\d[a-z]?-.*\.yaml$/.test(name))
      .filter((name) => !/-(open-profile|scene-lifecycle)\.yaml$/.test(name))
      .filter((name) => !name.includes('ipad'))
      .map((name) => `.maestro/${name}`)
      .filter((path) => !covered.has(path));
    expect(missing).toEqual([]);
  });

  test('fixture-specific journeys stay out of the shared run', () => {
    for (const path of separate) expect(suite).not.toContain(path);
  });
});

describe('Maestro lane ports', () => {
  const port = (fixture: string) =>
    spawnSync(
      '/bin/bash',
      [
        '-c',
        'OPAX_FIXTURE_PORT=$1; source scripts/qa-maestro.sh; qa_maestro_port || exit $?; echo "$OPAX_MAESTRO_DRIVER_PORT"',
        'port-test',
        fixture,
      ],
      { encoding: 'utf8' },
    );
  test.each([
    ['8900', '9000'],
    ['8973', '9073'],
    ['8999', '9099'],
  ])('fixture %s isolates its driver on %s', (fixture, expected) => {
    const result = port(fixture);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(expected);
  });
  test.each(['8800', '9000', '59000', '08973', '8973+1', '$(exit 99)'])(
    'invalid fixture %s fails before starting a driver',
    (fixture) => {
      const result = port(fixture);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(
        'OPAX_FIXTURE_PORT must be in 8900..8999',
      );
    },
  );
});

// Exercise a committed helper contract in every worktree. Python imports only
// this fixture, never driver.py, idb or a neighbouring ignored harness copy.
const capturePlan = resolve('tests/fixtures/capture-harness/plans.py');

test('capture controls focus native input, reach chrome and confirm sheet state without a device', () => {
  const output = execFileSync(
    'python3',
    [
      '-c',
      String.raw`
import asyncio
import importlib.util
import sys
import tempfile
import json
from pathlib import Path
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('capture_plans', sys.argv[1])
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

def element(label='', value=None, kind='Button', x=20, y=800, w=350, h=44, uid=None):
    return dict(AXLabel=label, AXValue=value, type=kind, AXUniqueId=uid,
                frame=dict(x=x, y=y, width=w, height=h))

class Fake:
    width, height = 402, 874
    def __init__(self, els=(), lines=()):
        self.els, self.lines = list(els), list(lines)
        self.taps, self.typed, self.deleted, self.keys, self.notes = [], [], [], [], []
        self.swipes, self.after_tap, self.after_swipe, self.echo = 0, None, None, True
        self.gone, self.after_gone, self.events = True, None, []
        self.clock, self.launches, self.shots = 0, [], []
        self.c = SimpleNamespace(tap=self.long_press, key=self.key)
    def frame(self, el):
        f = el['frame']
        return f['x'], f['y'], f['width'], f['height']
    def on_screen(self, el):
        x, y, w, h = self.frame(el)
        return w > 0 and h > 0 and 0 <= x < self.width and 0 <= y < self.height
    async def elements(self): return self.els
    def ocr(self): return self.lines
    async def find(self, test_id=None, label=None, **kwargs):
        return next((el for el in self.els if
                     (test_id is None or el.get('AXUniqueId') == test_id) and
                     (label is None or el.get('AXLabel') == label)), None)
    async def wait(self, *args, **kwargs): return await self.find(*args, **kwargs)
    async def wait_gone(self, uid, **kwargs):
        self.events.append(('gone', uid))
        if self.after_gone: self.after_gone()
        return self.gone
    async def link(self, url): self.events.append(('link', url))
    async def dump(self, name): pass
    async def shot(self, name): self.shots.append((name, self.clock))
    def launch(self, *args): self.launches.append(args)
    def reset(self): raise AssertionError('probe must not reinstall')
    async def tap(self, test_id=None, **kwargs):
        el = await self.find(test_id, **kwargs)
        if not el: return False
        x, y, w, h = self.frame(el)
        await self.tap_xy(x + w / 2, y + h / 2)
        return True
    async def tap_xy(self, x, y):
        self.taps.append((x, y))
        if self.after_tap: self.after_tap()
    async def long_press(self, **kwargs):
        assert kwargs['duration'] >= 0.5
        self.lines = [('Show passage', 50, 350, 160, 30)]
    async def text(self, text):
        assert self.taps, 'input sent without focusing the field'
        self.typed.append(text)
        if self.echo:
            if self.els: self.els[-1]['AXValue'] = text
            self.lines = [(text, 70, 800, 220, 30)]
    async def erase(self, n): self.deleted.append(n)
    async def key(self, n): self.keys.append(n)
    async def hid(self, what, fn): await fn()
    async def settle(self): pass
    async def pause(self, seconds): self.clock += seconds
    async def swipe(self, *args):
        self.swipes += 1
        if self.after_swipe: self.after_swipe()
    async def scroll_to(self, uid, **kwargs): return await self.find(uid)
    async def scroll_to_top(self, uid, **kwargs): return await self.find(uid)
    def note(self, text): self.notes.append(text)

async def check():
    # A busy launch can leave SpringBoard visible past five seconds. Its OPAX
    # icon is not an app frame, even when the tree has stopped changing.
    class Launch(Fake):
        async def elements(self):
            return ([element(uid='welcome-title')] if self.clock >= 5.5 else
                    [element('OPAX', uid='au.com.opax.app')])
    d = Launch()
    await p.cold_launch_frame(d, now=lambda: d.clock)
    assert d.shots == [('shell-07', 5.5)], d.shots
    assert len(d.launches) == 1
    d = Fake([element(uid='today-screen-message')])
    await p.cold_launch_frame(d, now=lambda: d.clock)
    assert d.shots == [('shell-07', 0)]

    class SlowRead(Fake):
        async def elements(self):
            self.clock += 61
            return [element(uid='welcome-title')]
    class StuckRead(Fake):
        async def elements(self):
            await asyncio.Future()
    class FailedRead(Fake):
        async def elements(self):
            raise RuntimeError('accessibility tree unavailable')
    for d, timeout in ((Fake([element('OPAX', uid='au.com.opax.app')]), 60),
                       (Fake([element(uid='welcome-title', y=-100)]), 60),
                       (SlowRead(), 60), (FailedRead(), 60), (StuckRead(), 0.01)):
        recorded = len(p.SPEC)
        # Like shell() awaiting _w4_welcome next, the next capture step must
        # still run when shell-07 is skipped. Any exception fails this test.
        await p.cold_launch_frame(d, now=lambda: d.clock, timeout=timeout)
        await d.link('opax://welcome')
        assert d.shots == [], d.shots
        assert d.notes == [f'shell-07 skipped: OPAX did not reach the foreground in {timeout:g} s; no frame saved'], d.notes
        assert d.events == [('link', 'opax://welcome')], d.events
        assert len(p.SPEC) == recorded
        assert d.clock <= 61, d.clock
    # Specification generation also lists the gated shell-07 without a device.
    await p.cold_launch_frame(p._Null())
    assert p.SPEC[-1]['id'] == 'shell-07'

    # idb exposes the seat search as a labelled button, even if another
    # TextField appears first. The native field can be in the bottom bar.
    field = element('Electorate or member’s name')
    d = Fake([element('Unrelated input', kind='TextField', y=200), field])
    assert await p.native_search(d, 'Zzqx', 'Electorate or member’s name')
    assert d.taps[0] == (195, 822), d.taps
    assert await p.native_search(d, 'Grayndler', 'Electorate or member’s name', previous='Zzqx')
    assert d.deleted == [5] and d.keys == [79] * 4
    assert d.typed == ['Zzqx', 'Grayndler']

    # OCR-only search and a normal TextField both still work.
    d = Fake(lines=[('Q Electorate or member’s name', 30, 800, 320, 28)])
    assert await p.native_search(d, 'Grayndler', 'Electorate or member’s name')
    d = Fake([element(kind='Text Field')])
    assert await p.native_search(d, 'housing', 'People, bills, topics and more')
    d = Fake([element('Electorate or member’s name')])
    d.echo = False
    assert not await p.native_search(d, 'Zzqx', 'Electorate or member’s name')

    # Accept UIKit's alternate bar role and the foreground sheet frame.
    # The native ids beat both a misleading label and a measured slot.
    for label, uid in [('More for Daily edition', 'header-more'),
                       ('Filters', 'header-filters'), ('Account', 'header-account')]:
        d = Fake([element(label, x=300, y=100),
                  element(uid=uid, label='', x=245, y=64, w=44, h=44)])
        assert await p.bar_action(d, label)
        assert d.taps == [(267, 86)], (label, d.taps)
    d = Fake([element(kind='NavigationBar', x=8, y=475, w=386, h=52)])
    assert await p.bar_action(d, 'Done')
    assert d.taps == [(354, 501)], d.taps
    d = Fake(lines=[('Parliamentarians', 100, 75, 200, 24)])
    assert await p.bar_action(d, 'Filters', trailing=1, title='Parliamentarians')
    assert d.taps == [(306, 87)], d.taps
    d = Fake(lines=[('Parliamentari...', 130, 75, 120, 24)])
    assert await p.bar_action(d, 'Filters', trailing=1, title='Parliamentarians')
    assert d.taps == [(306, 87)], d.taps
    d = Fake(lines=[('Sources Done', 170, 485, 200, 24)])
    assert await p.bar_action(d, 'Done')
    assert d.taps[0][0] > 300

    # Scope is above the count. Vision may merge the segments into one line.
    d = Fake(lines=[('Speeches about housing', 16, 180, 370, 44)])
    d.after_swipe = lambda: setattr(d, 'lines', [('All People Bills Speeches', 16, 180, 370, 44)])
    assert await p.search_scope(d, 'Speeches')
    assert d.swipes == 1 and d.taps[0][0] > 250

    # A tap alone must not claim that Sources opened or closed.
    d = Fake([element(uid='today-declarations-sources', y=600)],
             [('Registers of interests', 150, 600, 200, 25)])
    assert not await p.open_sources(d, 'today-declarations-sources', 'Registers of interests')
    d.after_tap = lambda: setattr(d, 'lines', [('Sources', 170, 485, 80, 24)])
    assert await p.open_sources(d, 'today-declarations-sources', 'Registers of interests')
    d.lines = [('Updated 4 Sep 2026 · Registers of interests', 16, 600, 370, 25)]
    assert await p.open_sources(d, 'today-declarations-sources', 'Registers of interests')
    assert d.taps[-1][0] > 200
    d.after_tap = None
    assert not await p.close_sheet(d, title='Sources')
    d.after_tap = lambda: setattr(d, 'lines', [])
    assert await p.close_sheet(d, title='Sources')

    # The citation screen has an empty bar title and a combined Source 1
    # heading. Require the passage content, never an invented bar title.
    d = Fake([element(uid='ask-citation-mark-1', y=350)])
    d.after_tap = lambda: setattr(d, 'els', [element(uid='citation-passage', y=550)])
    assert await p.open_citation(d)
    # Fall back to the row's Show passage menu if idb omits the inline mark.
    d = Fake([element(uid='ask-citation-1', y=350)])
    d.after_tap = lambda: setattr(d, 'els', [element(uid='citation-no-passage', y=550)])
    assert await p.open_citation(d)
    d = Fake([element(uid='ask-citation-1', y=350)])
    assert not await p.open_citation(d), 'a menu tap alone is not a citation'

    # Do not route while the chosen checkmark/modal is still present. After
    # it closes, idb may omit your-seat-name but OCR must show the right seat.
    row = element(uid='seat-row-federal-representatives-nsw-grayndler', y=250)
    d = Fake([row])
    d.after_gone = lambda: setattr(d, 'lines', [('Grayndler, New South Wales', 16, 150, 350, 24)])
    assert await p.choose_grayndler(d)
    assert [event[0] for event in d.events] == ['gone', 'link'], d.events
    d = Fake([row])
    d.gone = False
    assert not await p.choose_grayndler(d)
    assert not any(event[0] == 'link' for event in d.events)
    d = Fake([row], [('Sydney, New South Wales', 16, 150, 350, 24)])
    assert not await p.choose_grayndler(d)

    # Sample the entire ten seconds after a warm relaunch, including initial
    # empty samples and a real native item frame when it becomes available.
    class Geometry(Fake):
        async def elements(self):
            return [] if self.clock < 2 else [element(uid='header-account', x=310, y=60, w=44, h=44)]
    with tempfile.TemporaryDirectory() as root:
        d = Geometry([element(uid='today-screen-message')])
        d.evidence = Path(root)
        await p.cold_account(d, now=lambda: d.clock)
        result = json.loads((d.evidence / 'w9-account-geometry.json').read_text())
        assert len(d.launches) == 2
        assert result['windowSeconds'] == 10 and not result['reinstalled']
        assert result['samples'][0] == dict(elapsed=0, frames=[])
        assert result['samples'][-1] == dict(elapsed=9.75, frames=[[310, 60, 44, 44]])
        assert d.clock == 10
        # Empty geometry is a failed measurement, with its evidence retained.
        d = Fake([element(uid='today-screen-message')])
        d.evidence = Path(root)
        try:
            await p.cold_account(d, now=lambda: d.clock)
            raise AssertionError('empty Account measurement passed')
        except RuntimeError as error:
            assert 'no measurable frame' in str(error)
    print('capture helper regressions passed')

asyncio.run(check())
`,
      capturePlan,
    ],
    { encoding: 'utf8' },
  );
  expect(output).toContain('capture helper regressions passed');
});

const fixtureAudit = join(dirname(capturePlan), 'fixture-audit.mjs');
test('capture request audit accepts only the exact local expected 404 states', () => {
  const dir = mkdtempSync(join(tmpdir(), 'capture-audit-'));
  try {
    const file = join(dir, 'fixture.log');
    const audit = (
      path: string,
      status = 404,
      host = '127.0.0.1:8910',
      allowed = false,
    ) => {
      writeFileSync(
        file,
        `fixture ready\n${JSON.stringify({ path, status, host, allowed })}\n`,
      );
      return spawnSync(process.execPath, [fixtureAudit, file, '8910'], {
        encoding: 'utf8',
      });
    };
    for (const path of [
      '/interests/11023.json',
      '/api/person-topics?name=Basem+Abdo',
      '/bills/au-federal-r1.json',
    ]) {
      const result = audit(path);
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).expectedErrorStates).toEqual([path]);
      expect(audit(path, 500).status).toBe(1);
      const offHost = audit(path, 404, 'opax.com.au', true);
      expect(offHost.status).toBe(1);
      expect(JSON.parse(offHost.stdout).offHost).toBe(1);
    }
    expect(audit('/interests/11024.json').status).toBe(1);
    expect(audit('/api/person-topics?name=Basem+Abdo&extra=1').status).toBe(1);
    expect(audit('/api/person-topics?name=Someone+Else').status).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
