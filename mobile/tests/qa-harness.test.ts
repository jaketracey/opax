import { execFileSync } from 'node:child_process';

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
