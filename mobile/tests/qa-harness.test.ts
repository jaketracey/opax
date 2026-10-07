import { execFileSync, spawnSync } from 'node:child_process';

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
