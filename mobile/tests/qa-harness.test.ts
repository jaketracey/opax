import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

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

// The capture plan is intentionally outside git. Exercise it when present in
// this worktree, the integration worktree, or an explicitly supplied location.
// Python imports only plans.py. This fake never imports driver.py or idb.
const capturePlan =
  process.env.OPAX_CAPTURE_PLAN ??
  [
    resolve('private/apple-design/harness/plans.py'),
    resolve('../../apple-design/mobile/private/apple-design/harness/plans.py'),
  ].find(existsSync);

(capturePlan ? test : test.skip)(
  'capture controls focus native input, reach chrome and confirm sheet state without a device',
  () => {
    const output = execFileSync(
      'python3',
      [
        '-c',
        String.raw`
import asyncio
import importlib.util
import sys
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
    async def pause(self, seconds): pass
    async def swipe(self, *args):
        self.swipes += 1
        if self.after_swipe: self.after_swipe()
    async def scroll_to(self, uid, **kwargs): return await self.find(uid)
    async def scroll_to_top(self, uid, **kwargs): return await self.find(uid)
    def note(self, text): self.notes.append(text)

async def check():
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

    # The cited record's normal tap pushes a bill. Show passage is the
    # action that presents /citation; exercise its actual long press path.
    d = Fake([element(uid='ask-citation-1', y=350)])
    d.after_tap = lambda: setattr(d, 'lines', [('Citation 1', 150, 485, 100, 24)])
    assert await p.open_citation(d)
    print('capture helper regressions passed')

asyncio.run(check())
`,
        capturePlan!,
      ],
      { encoding: 'utf8' },
    );
    expect(output).toContain('capture helper regressions passed');
  },
);
