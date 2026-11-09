import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = join(__dirname, '..');
const native = ['--import', 'tsx', 'scripts/native-config.ts'];
const approved = spawnSync(
  process.execPath,
  [...native, '--location-purposes'],
  {
    cwd,
    encoding: 'utf8',
  },
);
if (approved.status !== 0) throw new Error(approved.stderr);
const purposes = JSON.parse(approved.stdout) as Record<string, string>;

test.each([
  ['CNG', process.execPath, native],
  ['archive and IPA', 'python3', ['scripts/verify-ios-release.py']],
] as const)(
  '%s accepts both approved prompts and rejects stale or absent device variants',
  (_name, executable, args) => {
    const directory = mkdtempSync(join(tmpdir(), 'opax-location-prompts-'));
    const path = join(directory, 'plist.json');
    const run = (info: Record<string, string>) => {
      writeFileSync(path, JSON.stringify(info));
      return spawnSync(executable, [...args, '--location-only', path], {
        cwd,
        encoding: 'utf8',
      });
    };
    try {
      expect(Object.keys(purposes).sort()).toEqual([
        'NSLocationWhenInUseUsageDescription',
        'NSLocationWhenInUseUsageDescription~ipad',
      ]);
      expect(run(purposes)).toMatchObject({ status: 0 });
      for (const key of Object.keys(purposes)) {
        expect(
          run({
            ...purposes,
            [key]:
              'OPAX uses your location once, on this device, to suggest your electorate. It is not sent anywhere.',
          }).status,
        ).not.toBe(0);
        expect(
          run(
            Object.fromEntries(
              Object.entries(purposes).filter(([name]) => name !== key),
            ),
          ).status,
        ).not.toBe(0);
      }
    } finally {
      rmSync(directory, { recursive: true });
    }
  },
);

test('the release script runs the same verifier for the archive and exported IPA', () => {
  const script = readFileSync(join(cwd, 'scripts/release-ios.sh'), 'utf8');
  expect(script).toContain(
    'python3 -u scripts/verify-ios-release.py "$1" --kind "$2"',
  );
  expect(script).toContain(
    'verify "$ARCHIVE/Products/Applications/OPAX.app" archive',
  );
  expect(script).toContain('verify "$IPA" distribution');
});
