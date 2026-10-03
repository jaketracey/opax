import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { boundaryFiles } from '../scripts/boundary-files';
import { scanSecrets } from '../scripts/secret-boundary';

test('module tooling leaves app/origin inputs but remains in the secrets scan', () => {
  const root = mkdtempSync(join(tmpdir(), 'opax-tooling-'));
  try {
    const src = join(root, 'src');
    const modules = join(root, 'modules');
    const module = join(modules, 'opax-voice');
    const scripts = join(module, 'scripts');
    mkdirSync(src);
    mkdirSync(join(scripts, 'fixtures'), { recursive: true });
    mkdirSync(join(module, 'src', 'scripts'), { recursive: true });
    const generator = join(scripts, 'generate-deletion-fixtures.mjs');
    const secret = join(scripts, 'fixtures', 'credentials.json');
    const native = join(scripts, 'Native.swift');
    const app = join(module, 'src', 'scripts', 'app.ts');
    writeFileSync(
      generator,
      `const request = new Request('http://127.0.0.1:8953/api/delete')`,
    );
    writeFileSync(secret, `access_token="${'x'.repeat(32)}"`);
    writeFileSync(native, 'URLSession.shared');
    writeFileSync(app, `fetch('/api/ask')`);
    const files = boundaryFiles(src, modules);
    expect(files.javascript).toEqual([app]);
    expect(files.tooling.sort()).toEqual([generator, secret, native].sort());
    expect(files.swift).toEqual([native]);
    expect(scanSecrets(files.tooling)).toEqual([secret]);
    writeFileSync(secret, '{}');
    expect(scanSecrets(files.tooling)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('actual ESLint config exempts Node tooling and rejects app imports into it', () => {
  const script = `const { ESLint } = require('eslint'); (async () => {
    const lint = new ESLint();
    const inputs = [
      ['modules/opax-voice/scripts/generate.mjs', "fetch('http://127.0.0.1:8953/api/delete')"],
      ['modules/opax-voice/index.ts', "import './scripts/generate.mjs'"],
      ['src/app.ts', "import '../modules/opax-voice/scripts/generate.mjs'"],
      ['modules/opax-voice/src/scripts/app.ts', "fetch('/api/ask')"],
    ];
    const results = await Promise.all(inputs.map(([filePath, content]) => lint.lintText(content, {filePath})));
    console.log(JSON.stringify(results.map(result => result[0].messages.map(message => message.ruleId))));
  })().catch(error => { console.error(error); process.exit(1); });`;
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  const [tooling, ...sources] = JSON.parse(result.stdout);
  expect(tooling).not.toContain('opax/transport');
  for (const rules of sources) expect(rules).toContain('opax/transport');
});
