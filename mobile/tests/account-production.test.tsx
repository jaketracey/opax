import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import ProductionAccount from '../src/features/account/entry.production';
import { AccountComingSoon } from '../src/features/ComingSoon';
import { AccountScreen } from '../src/features/account/AccountScreen';

// Production builds keep Account and about exactly as it was before voice:
// Metro resolves entry.production.ts, and metro.config.js keeps the sign-in
// routes and every other account file out of the bundle.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/voice', () => ({
  status: jest.fn(async () => ({ ok: false, error: 'unavailable' })),
  subscribe: jest.fn(() => () => {}),
}));
jest.mock('../src/design/environment', () => ({
  ...jest.requireActual('../src/design/environment'),
  isProduction: true,
}));

const root = resolve(__dirname, '..');
function metro(variant: string, script: string) {
  return JSON.parse(
    execFileSync(process.execPath, ['-e', script], {
      cwd: root,
      env: { ...process.env, OPAX_VARIANT: variant },
      encoding: 'utf8',
    }),
  );
}
const blockList = (variant: string) =>
  (
    metro(
      variant,
      'const c = require("./metro.config.js"); process.stdout.write(JSON.stringify([c.resolver.blockList].flat().filter(Boolean).map((r) => r.source)))',
    ) as string[]
  ).map((source) => new RegExp(source));
const blocked = (list: RegExp[], path: string) =>
  list.some((pattern) => pattern.test(resolve(root, path)));

test('the production entry is the unchanged placeholder', async () => {
  expect(ProductionAccount).toBe(AccountComingSoon);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<ProductionAccount />);
  });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain(
    'Signing in is not in this version of the app yet. An account will only be needed to talk to OPAX.',
  );
  expect(text).toContain('About and sources');
  for (const absent of [
    'Sign in for voice',
    'Send code',
    'Delete account',
    'Sign out',
    'Design workbench',
  ])
    expect(text).not.toContain(absent);
});

test('production never draws the Development section, placeholder or not', async () => {
  // The placeholder ships today; the full sheet ships once the voice switch
  // flips. Neither may show development UI in a production build.
  for (const Sheet of [ProductionAccount, AccountScreen]) {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<Sheet />);
    });
    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain('About OPAX');
    expect(text).not.toContain('Development');
    expect(text).not.toContain('Design workbench');
    expect(text).not.toContain('account-workbench');
    act(() => renderer.unmount());
  }
});

test.each(['production', 'e2e', 'development'])(
  '%s resolves the Account entry at build time',
  (variant) => {
    const [entry, other] = metro(
      variant,
      `
      const path = require('node:path');
      const config = require('./metro.config.js');
      const context = {
        originModulePath: path.resolve('src/app/account/index.tsx'),
        resolveRequest: (_context, name) => ({
          type: 'sourceFile', filePath: path.resolve('src/app/account', name + '.tsx'),
        }),
      };
      const resolve = name => config.resolver.resolveRequest(context, name, 'ios');
      process.stdout.write(JSON.stringify([resolve('../../features/account/entry'), resolve('./about')]));
    `,
    ) as { filePath: string }[];
    expect(entry!.filePath).toBe(
      resolve(
        root,
        'src/features/account',
        variant === 'production' ? 'entry.production.ts' : 'entry.tsx',
      ),
    );
    expect(other!.filePath).toBe(resolve(root, 'src/app/account/about.tsx'));
  },
);

test('production bundles cannot see the sign-in or deletion screens', () => {
  const list = blockList('production');
  for (const path of [
    'src/app/account/sign-in.tsx',
    'src/app/account/delete.tsx',
    'src/features/account/entry.tsx',
    'src/features/account/AccountScreen.tsx',
    'src/features/account/SignInFlow.tsx',
    'src/features/account/DeleteAccountFlow.tsx',
    'src/features/account/copy.ts',
    'src/features/account/store.ts',
  ])
    expect([path, blocked(list, path)]).toEqual([path, true]);
  for (const path of [
    'src/features/account/entry.production.ts',
    'src/app/account/index.tsx',
    'src/app/account/about.tsx',
    'src/app/account/_layout.tsx',
    'src/features/ComingSoon.tsx',
    'src/features/About.tsx',
  ])
    expect([path, blocked(list, path)]).toEqual([path, false]);
});

test('development and e2e builds keep them', () => {
  for (const variant of ['development', 'e2e'])
    for (const path of [
      'src/app/account/sign-in.tsx',
      'src/app/account/delete.tsx',
      'src/features/account/SignInFlow.tsx',
    ])
      expect(blocked(blockList(variant), path)).toBe(false);
});

test('the exclusions are valid in the release verifier’s Python syntax', () => {
  const sources = blockList('production').map((rule) => rule.source);
  const output = execFileSync(
    'python3',
    [
      '-c',
      'import json, re, sys; [re.compile(s, re.ASCII) for s in json.load(sys.stdin)]; print("ok")',
    ],
    { input: JSON.stringify(sources), encoding: 'utf8' },
  );
  expect(output.trim()).toBe('ok');
});
