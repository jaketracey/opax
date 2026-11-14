import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.resolve(__dirname, '../scripts/maestro-tap-budget.mjs');
const flows = ['66-my-mp-journey', '67-my-mp-entry-points'].map((name) =>
  path.resolve(__dirname, '../.maestro', `${name}.yaml`),
);

it('keeps both My MP journeys within their marked tap budgets', () => {
  const output = execFileSync(process.execPath, [script, ...flows], {
    encoding: 'utf8',
  });
  expect(output).toContain('first-launch-member: 3/3');
  expect(output).toContain('today-member-profile: 1/1');
  expect(output).toContain('today-official-page: 2/2');
  expect(output).toContain('figure-original: 2/2');
});

it('counts nested runFlow files and long presses, and fails an over-budget inline fixture', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'maestro-budget-'));
  try {
    writeFileSync(
      path.join(dir, 'child.yaml'),
      'appId: test\n---\n- longPressOn: Member\n',
    );
    const file = path.join(dir, 'fixture.yaml');
    writeFileSync(
      file,
      `appId: test
---
# budget: today-official-page
- tapOn: Member
- runFlow:
    commands:
      - runFlow: child.yaml
- tapOn: Parliament of Australia page
# end: today-official-page
`,
    );
    const result = spawnSync(process.execPath, [script, file], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('3 taps exceeds budget 2');
    // Without the extra tap the same nested path is allowed.
    writeFileSync(
      file,
      `appId: test
---
# budget: today-official-page
- runFlow: child.yaml
- tapOn: Parliament of Australia page
# end: today-official-page
`,
    );
    expect(spawnSync(process.execPath, [script, file]).status).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it.each([
  [
    'unclosed',
    '# budget: figure-original\n- tapOn: Source\n',
    'unclosed budget',
  ],
  [
    'recursive',
    '# budget: figure-original\n- runFlow: fixture.yaml\n# end: figure-original\n',
    'recursive runFlow',
  ],
  [
    'repeat',
    '# budget: figure-original\n- repeat:\n    times: 3\n    commands:\n      - tapOn: Source\n# end: figure-original\n',
    '3 taps exceeds budget 2',
  ],
])('rejects %s fixture', (_name, steps, message) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'maestro-budget-'));
  try {
    const file = path.join(dir, 'fixture.yaml');
    writeFileSync(file, `appId: test\n---\n${steps}`);
    const result = spawnSync(process.execPath, [script, file], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const auditScript = path.resolve(__dirname, '../scripts/maestro-id-audit.mjs');

it('anchors every template part, escapes literals and reports weak prefix matches', () => {
  const probe = `
    import { classifySelector, sourceTemplate } from ${JSON.stringify(`file://${auditScript}`)};
    const source = {
      strings: new Set(['welcome-screen', 'word.before.word']),
      templates: [
        ['bill-speech-', ''],
        ['', '-original-', ''],
        ['sheet.', '-ready'],
        ['ab', ''],
      ].map(sourceTemplate).filter(Boolean),
    };
    console.log(JSON.stringify([
      'welcome-screen',
      'welcome',
      'word.before.*',
      '^bill-speech-[0-9]+$',
      'bill-speech-0',
      'thing-original-0',
      'thing-original-0-extra',
      'thing-original-',
      'sheet.name-ready',
      'sheetXname-ready',
      'ab-unknown',
      'seat-search',
      'today-edition-head',
    ].map(id => classifySelector(id, source))));
  `;
  const result = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', probe],
    { encoding: 'utf8' },
  );
  expect(JSON.parse(result)).toEqual([
    'found',
    'missing',
    'found',
    'prefix',
    'prefix',
    'found',
    'found',
    'missing',
    'found',
    'missing',
    'missing',
    'missing',
    'missing',
  ]);
});

it('audits id parameters passed through nested runFlow env blocks', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'maestro-id-audit-'));
  try {
    writeFileSync(
      path.join(dir, 'child.yaml'),
      'appId: test\n---\n- assertVisible:\n    id: ${END}\n',
    );
    writeFileSync(
      path.join(dir, 'middle.yaml'),
      'appId: test\n---\n- runFlow:\n    file: child.yaml\n    env:\n      END: ${TARGET}\n',
    );
    const file = path.join(dir, 'fixture.yaml');
    writeFileSync(
      file,
      `appId: test
---
- runFlow:
    file: middle.yaml
    env:
      TARGET: audit-intentionally-unknown
      UNUSED: ignored-not-an-id
- runFlow:
    file: child.yaml
    env:
      END: welcome-screen
`,
    );
    const output = execFileSync(process.execPath, [auditScript, file], {
      encoding: 'utf8',
    });
    expect(output).toContain('(id ${END}): audit-intentionally-unknown');
    expect(output).not.toContain(': welcome-screen');
    expect(output).not.toContain('ignored-not-an-id');
    expect(output).toContain('1 missing; 0 held only by a prefix template.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('accepts unbudgeted flows alongside journeys and still requires journey markers', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'maestro-budget-'));
  try {
    const file = path.join(dir, '01-launch.yaml');
    writeFileSync(file, 'appId: test\n---\n- tapOn: Account\n');
    const result = execFileSync(process.execPath, [script, file, ...flows], {
      encoding: 'utf8',
    });
    expect(result).toContain('01-launch.yaml: no declared tap budgets');
    expect(result).toContain('figure-original: 2/2');
    const required = path.join(dir, '66-my-mp-journey.yaml');
    writeFileSync(required, 'appId: test\n---\n- tapOn: Member\n');
    const missing = spawnSync(process.execPath, [script, required], {
      encoding: 'utf8',
    });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('missing budget first-launch-member');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('counts field focus and rejects a fourth first-launch tap', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'maestro-budget-'));
  try {
    const file = path.join(dir, 'fixture.yaml');
    writeFileSync(
      file,
      `appId: test
---
# budget: first-launch-member
- tapOn: Continue
- tapOn: Electorate or member.s name
- inputText: Grayndler
- tapOn: Grayndler
- tapOn: Extra navigation
# end: first-launch-member
`,
    );
    const result = spawnSync(process.execPath, [script, file], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('4 taps exceeds budget 3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
