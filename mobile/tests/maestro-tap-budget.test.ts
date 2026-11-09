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
  expect(output).toContain('first-launch-member: 2/2');
  expect(output).toContain('today-latest-vote: 1/1');
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
  ['missing', '- tapOn: Source\n', 'no tap budget markers'],
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
