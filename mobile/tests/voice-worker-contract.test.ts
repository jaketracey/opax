import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const source = readFileSync(
  resolve(__dirname, '../../portal/src/voice.ts'),
  'utf8',
);
function check(worker: string) {
  const temporary = mkdtempSync(join(tmpdir(), 'opax-voice-contract-'));
  const path = join(temporary, 'worker.ts');
  writeFileSync(path, worker);
  try {
    execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        'import {readFileSync} from "node:fs"; import {assertWorkerContract} from "./scripts/voice-worker-contract.ts"; await assertWorkerContract(readFileSync(process.argv[1], "utf8"));',
        path,
      ],
      { cwd: resolve(__dirname, '..'), stdio: 'pipe' },
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
test('unrelated Worker edits do not invalidate the voice fixture', () => {
  expect(() =>
    check(
      source.replace('Isolated relay logic', 'Unrelated relay documentation'),
    ),
  ).not.toThrow();
  expect(() =>
    check(
      source.replace(
        'async function toolAuthorized(',
        'async function renamedToolAuthorized(',
      ),
    ),
  ).not.toThrow();
  expect(() =>
    check(source + '\n// Unrelated tool or logging change\n'),
  ).not.toThrow();
  expect(() =>
    check(
      source.replace('Voice endpoint not found.', 'Unrelated endpoint text.'),
    ),
  ).not.toThrow();
});
test('an unrelated response with a session ID does not alter the start pin', () => {
  expect(() =>
    check(
      source +
        '\nfunction unrelated() { return json({session_id: "unrelated"}, 200) }\n',
    ),
  ).not.toThrow();
});
test('response formatting and property order do not change the contract', () => {
  const changed = source.replace(
    "{session_id:session.id, transport:'websocket'",
    '{transport:"websocket", "session_id":session.id',
  );
  expect(changed).not.toBe(source);
  expect(() => check(changed)).not.toThrow();
});
test.each([
  [
    'messageFilter',
    source.replace(
      'max_duration_seconds: seconds',
      'max_duration_seconds: seconds + 1',
    ),
  ],
  [
    'statusResponseShapes',
    source.replace('signed_in: false', 'signed_in: true'),
  ],
  [
    'startResponseShape',
    source.replace("transport:'websocket'", "transport:'changed'"),
  ],
])('relevant drift clearly names %s', (name, changed) => {
  expect(changed).not.toBe(source);
  try {
    check(changed);
    throw new Error('Drift was accepted');
  } catch (error) {
    const stderr =
      (error as { stderr?: Buffer }).stderr?.toString() ?? String(error);
    expect(stderr).toContain(`Voice fixture drift: ${name} changed`);
  }
});
