import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'opax-android-build-'));
  mkdirSync(join(root, 'scripts'));
  for (const name of [
    'build-android.sh',
    'qa-env.sh',
    'capacity.sh',
    'qa-lock.sh',
  ])
    cpSync(join(__dirname, '../scripts', name), join(root, 'scripts', name));
  for (const directory of ['bin', 'jdk/bin', 'node_modules/.bin', 'android'])
    mkdirSync(join(root, directory), { recursive: true });
  executable(
    'bin/uname',
    '#!/bin/sh\ncase "$1" in -s) echo "$TEST_OS";; -m) echo x86_64;; esac\n',
  );
  executable(
    'node_modules/.bin/expo',
    '#!/bin/sh\n[ "$TEST_OS" != Linux ] || test -s "$OPAX_ANDROID_NATIVE_LOCK/pid"\n',
  );
  executable(
    'jdk/bin/java',
    `#!/bin/bash
printf '%s\\n' "$@" > ../gradle-args
type=debug
case "$OPAX_VARIANT" in e2e) type=e2e;; production) type=release;; esac
mkdir -p "app/build/outputs/apk/$type"
echo apk > "app/build/outputs/apk/$type/app-$type.apk"
`,
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function executable(path: string, text: string) {
  writeFileSync(join(root, path), text, { mode: 0o755 });
}
function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync('/bin/bash', args, {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${root}/bin:${process.env.PATH}`,
      JAVA_HOME: join(root, 'jdk'),
      ANDROID_HOME: join(root, 'sdk'),
      OPAX_BUILD_GATE: join(root, 'missing-mac-gate'),
      OPAX_CAPACITY_CMD: 'exit 99',
      OPAX_ANDROID_NATIVE_LOCK: join(root, 'native.lock'),
      OPAX_ANDROID_NATIVE_WAIT_SECONDS: '0',
      OPAX_ANDROID_ABIS: '',
      TEST_OS: 'Linux',
      ...env,
    },
    encoding: 'utf8',
    timeout: 10000,
  });
}

test.each(['development', 'e2e', 'production'])(
  'Linux %s prebuild and Gradle share the desktop lock and use x86_64',
  (variant) => {
    const result = run(['scripts/build-android.sh', variant]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('skipping Mac capacity checks');
    expect(readFileSync(join(root, 'gradle-args'), 'utf8')).toContain(
      '-PreactNativeArchitectures=x86_64',
    );
    expect(existsSync(join(root, 'native.lock'))).toBe(false);
  },
);

test('an explicit ABI list wins over host detection', () => {
  expect(
    run(['scripts/build-android.sh', 'development'], {
      OPAX_ANDROID_ABIS: 'arm64-v8a,x86_64',
    }).status,
  ).toBe(0);
  expect(readFileSync(join(root, 'gradle-args'), 'utf8')).toContain(
    '-PreactNativeArchitectures=arm64-v8a,x86_64',
  );
});

test('invalid ABI input fails before prebuild and releases the lock', () => {
  const result = run(['scripts/build-android.sh', 'development'], {
    OPAX_ANDROID_ABIS: 'x86_64,bogus',
  });
  expect(result.status).toBe(2);
  expect(existsSync(join(root, 'gradle-args'))).toBe(false);
  expect(existsSync(join(root, 'native.lock'))).toBe(false);
});

test('Mac retains its gate and arm64 default', () => {
  executable('gate', '#!/bin/bash\necho "$1" > gate-call\nshift\n"$@"\n');
  expect(
    run(['scripts/build-android.sh', 'development'], {
      TEST_OS: 'Darwin',
      OPAX_BUILD_GATE: join(root, 'gate'),
      OPAX_CAPACITY_CMD: '',
    }).status,
  ).toBe(0);
  expect(readFileSync(join(root, 'gate-call'), 'utf8')).toBe('opax-harness\n');
  expect(readFileSync(join(root, 'gradle-args'), 'utf8')).toContain(
    '-PreactNativeArchitectures=arm64-v8a',
  );
});

test('a live lock owner is protected and the deadline prevents a build', () => {
  mkdirSync(join(root, 'native.lock'));
  writeFileSync(join(root, 'native.lock/pid'), String(process.pid));
  expect(run(['scripts/build-android.sh', 'development']).status).toBe(75);
  expect(readFileSync(join(root, 'native.lock/pid'), 'utf8')).toBe(
    String(process.pid),
  );
  expect(existsSync(join(root, 'gradle-args'))).toBe(false);
});

test('failed commands release the desktop lock', () => {
  expect(
    run([
      '-c',
      'source scripts/qa-env.sh; android_build_command bash -c "exit 42"',
    ]).status,
  ).toBe(42);
  expect(existsSync(join(root, 'native.lock'))).toBe(false);
});
