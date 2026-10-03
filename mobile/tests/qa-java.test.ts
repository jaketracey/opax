import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Candidate = { path: string; version: string; exits?: number };
type Scenario = {
  name: string;
  inherited?: Candidate;
  sdk?: Candidate[];
  mac?: Candidate;
  path?: Candidate[];
  selected?: string;
};
const old = { path: 'inherited', version: '1.8.0_442' };
const scenarios: Scenario[] = [
  {
    name: 'valid inherited Java has priority',
    inherited: { path: 'inherited', version: '17.0.1' },
    sdk: [{ path: 'sdk/current', version: '21.0.1' }],
    selected: 'inherited',
  },
  {
    name: 'inherited Java 8 and sdkman current Java 8 fall back to sdkman 21',
    inherited: old,
    sdk: [
      { path: 'sdk/current', version: '1.8.0_442' },
      { path: 'sdk/21-test', version: '21.0.1' },
    ],
    selected: 'sdk/21-test',
  },
  {
    name: 'sdkman current is checked before other sdkman installations',
    sdk: [
      { path: 'sdk/current', version: '17.0.1' },
      { path: 'sdk/21-test', version: '21.0.1' },
    ],
    selected: 'sdk/current',
  },
  {
    name: 'inherited Java 8 falls back to macOS lookup',
    inherited: old,
    mac: { path: 'mac-jdk', version: '17.0.1' },
    selected: 'mac-jdk',
  },
  {
    name: 'inherited Java 8 and an old first PATH entry fall back to later PATH Java',
    inherited: old,
    path: [
      { path: 'path-old', version: '1.8.0_442' },
      { path: 'path-new', version: '21.0.1' },
    ],
    selected: 'PATH',
  },
  {
    name: 'missing inherited installation falls back to sdkman',
    inherited: { path: 'missing', version: '' },
    sdk: [{ path: 'sdk/17-test', version: '17.0.1' }],
    selected: 'sdk/17-test',
  },
  {
    name: 'a broken inherited java executable falls back',
    inherited: { path: 'broken', version: '21.0.1', exits: 1 },
    mac: { path: 'mac-jdk', version: '17.0.1' },
    selected: 'mac-jdk',
  },
  {
    name: 'an unrecognizable inherited version falls back',
    inherited: { path: 'garbled', version: 'unknown' },
    sdk: [{ path: 'sdk/21-test', version: '21.0.1' }],
    selected: 'sdk/21-test',
  },
  {
    name: 'an old macOS candidate falls back to PATH',
    mac: { path: 'mac-jdk', version: '11.0.1' },
    path: [{ path: 'path-new', version: '17.0.1' }],
    selected: 'PATH',
  },
  {
    name: 'all candidates too old fail',
    inherited: old,
    sdk: [{ path: 'sdk/current', version: '11.0.1' }],
    mac: { path: 'mac-jdk', version: '11.0.1' },
    path: [{ path: 'path-old', version: '1.8.0_442' }],
  },
  { name: 'no installations fail' },
];

test.each(scenarios)('Java lookup: $name', (scenario) => {
  const root = mkdtempSync(join(tmpdir(), 'opax-java-'));
  try {
    for (const candidate of [
      scenario.inherited,
      ...(scenario.sdk ?? []),
      scenario.mac,
      ...(scenario.path ?? []),
    ]) {
      if (!candidate?.version) continue;
      const bin = join(root, candidate.path, 'bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(
        join(bin, 'java'),
        `#!/bin/sh\necho 'openjdk version "${candidate.version}"' >&2\nexit ${candidate.exits ?? 0}\n`,
        { mode: 0o755 },
      );
    }
    const lookup = join(root, 'java-home');
    if (scenario.mac)
      writeFileSync(
        lookup,
        '#!/bin/sh\n[ "$1" = -v ] && [ "$2" = "17+" ] || exit 2\nprintf "%s\\n" "$JAVA_TEST_HOME"\n',
        { mode: 0o755 },
      );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      JAVA_TEST_HOME: scenario.mac ? join(root, scenario.mac.path) : '',
      // Do not let the host's Java make a deliberately failing fixture pass.
      PATH:
        (scenario.path ?? [])
          .map((candidate) => join(root, candidate.path, 'bin'))
          .join(':') || join(root, 'empty-path'),
    };
    delete env.JAVA_HOME;
    if (scenario.inherited) env.JAVA_HOME = join(root, scenario.inherited.path);
    const result = spawnSync(
      '/bin/bash',
      [
        '-c',
        'source scripts/qa-java.sh; configure_java "$1" "$2" || exit; printf "selected=%s\\nhome=%s\\n" "${JAVA_HOME:-PATH}" "$HOME"; java -version',
        'qa-java-test',
        join(root, 'sdk'),
        lookup,
      ],
      { env, encoding: 'utf8' },
    );
    expect(result.status).toBe(scenario.selected ? 0 : 1);
    if (scenario.selected) {
      const expected =
        scenario.selected === 'PATH' ? 'PATH' : join(root, scenario.selected);
      expect(result.stdout).toBe(`selected=${expected}\nhome=${env.HOME}\n`);
      expect(result.stderr).toMatch(/openjdk version "(?:17|21)/);
    } else {
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/Java 17\+ required/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
