import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Execute the release script's real branching and gate re-entry using command
// doubles only. No Expo exports, native prebuilds or builds run in this test.
test.each([
  { name: 'gated iOS', args: [] },
  { name: 'inside-gate iOS', args: ['--inside-gate'] },
  { name: 'Android only', args: ['--android'] },
])(
  '$name release path inherits EXPO_NO_DOTENV for every command',
  ({ args }) => {
    const root = mkdtempSync(join(tmpdir(), 'opax-release-bundle-'));
    try {
      for (const directory of ['scripts', 'node_modules/.bin', 'bin'])
        mkdirSync(join(root, directory), { recursive: true });
      for (const file of ['check-release-bundle.sh', 'qa-env.sh'])
        copyFileSync(join('scripts', file), join(root, 'scripts', file));
      const stub = `#!/bin/bash
printf '%s|%s|%s|%s|%s\\n' "\${0##*/}" "$*" "\${EXPO_NO_DOTENV:-missing}" "\${OPAX_TARGET_PLATFORM:-unset}" "$OPAX_VARIANT" >> "$OPAX_EXPORT_TEST_LOG"
`;
      for (const file of [
        'node_modules/.bin/expo',
        'node_modules/.bin/tsx',
        'scripts/capacity.sh',
      ])
        writeFileSync(join(root, file), stub, { mode: 0o755 });
      writeFileSync(join(root, 'bin/uname'), '#!/bin/bash\necho Darwin\n', {
        mode: 0o755,
      });
      writeFileSync(join(root, 'gate'), `${stub}shift\nbash "$@"\n`, {
        mode: 0o755,
      });
      const log = join(root, 'commands');
      const result = spawnSync(
        '/bin/bash',
        ['scripts/check-release-bundle.sh', ...args],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${join(root, 'bin')}:${process.env.PATH}`,
            OPAX_BUILD_GATE: join(root, 'gate'),
            OPAX_EXPORT_TEST_LOG: log,
            EXPO_NO_DOTENV: '0',
            OPAX_TARGET_PLATFORM: '',
          },
        },
      );
      expect({ status: result.status, stderr: result.stderr }).toEqual({
        status: 0,
        stderr: '',
      });
      const commands = readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split('|'));
      for (const command of commands)
        expect([command[2], command[4]]).toEqual(['1', 'production']);
      const exports = commands.filter(
        ([tool, command]) => tool === 'expo' && command!.startsWith('export '),
      );
      expect(exports.map((command) => command[3])).toEqual(
        args[0] === '--android' ? ['android'] : ['ios', 'android'],
      );
      if (args[0] === '--android')
        expect(
          commands.some(([, command]) => command!.startsWith('prebuild ')),
        ).toBe(false);
      else
        expect(commands).toContainEqual([
          'expo',
          'prebuild --platform ios --clean',
          '1',
          'unset',
          'production',
        ]);
      if (!args.length)
        expect(commands.some(([tool]) => tool === 'gate')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
