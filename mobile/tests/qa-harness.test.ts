import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

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
    const covered = new Set([...suite, ...separate]);
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
      expect(result.stderr).toContain('OPAX_FIXTURE_PORT must be in 8900..8999');
    },
  );
});
