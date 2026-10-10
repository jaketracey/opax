import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import * as shipped from '../src/features/community/entry';
import { ExploreGrid } from '../src/features/today/ExploreGrid';
import { AccountScreen } from '../src/features/account/AccountScreen';
import { redirectSystemPath } from '../src/app/+native-intent';
import { fromWebPath } from '../src/navigation/routes';
import { canonicalUrl } from '../src/navigation/external';
import { assertAllowedPath } from '../src/api/policy';
import { accountCopy } from '../src/features/account/copy';

// The 1.0 App Store build leaves Community on the web, so OPAX stays 13+ in
// Australia (release/1.0/age-rating.json, communityHidden). This file draws
// the app as production does: Metro resolves the Community entry to
// entry.production.ts, mocked in here the same way.
jest.mock('../src/features/community/entry', () =>
  jest.requireActual('../src/features/community/entry.production'),
);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));
jest.mock('../src/voice', () => ({
  status: jest.fn(async () => ({ ok: false, error: 'unavailable' })),
  subscribe: jest.fn(() => () => {}),
}));

const root = resolve(__dirname, '..');
function metro(env: Record<string, string>, script: string) {
  return execFileSync(process.execPath, ['-e', script], {
    cwd: root,
    env: { ...process.env, OPAX_HIDE_COMMUNITY: '0', ...env },
    encoding: 'utf8',
  });
}
const blockList = (env: Record<string, string>) =>
  (
    JSON.parse(
      metro(
        env,
        'const c = require("./metro.config.js"); process.stdout.write(JSON.stringify([c.resolver.blockList].flat().filter(Boolean).map((r) => r.source)))',
      ),
    ) as string[]
  ).map((source) => new RegExp(source));
const blocked = (list: RegExp[], path: string) =>
  list.some((pattern) => pattern.test(resolve(root, path)));
const entryFor = (env: Record<string, string>) =>
  JSON.parse(
    metro(
      env,
      `
      const path = require('node:path');
      const config = require('./metro.config.js');
      const context = {
        originModulePath: path.resolve('src/features/today/ExploreGrid.tsx'),
        resolveRequest: (_context, name) => ({
          type: 'sourceFile', filePath: path.resolve('src/features/today', name + '.ts'),
        }),
      };
      process.stdout.write(JSON.stringify(
        config.resolver.resolveRequest(context, '../community/entry', 'ios')));
    `,
    ),
  ).filePath as string;

const communityFiles = [
  'src/app/community/_layout.tsx',
  'src/app/community/[view].tsx',
  'src/features/community/CommunityScreen.tsx',
  'src/features/community/AndroidCommunityScreen.tsx',
  'src/features/community/session.ts',
  'src/features/community/routes.ts',
  'src/features/community/policy.ts',
  'src/features/community/model.ts',
  'src/features/community/entry.ts',
];

test('production and a community-hidden e2e build resolve the stub and block every Community file', () => {
  for (const env of [
    { OPAX_VARIANT: 'production' },
    { OPAX_VARIANT: 'production', OPAX_PRODUCTION_VOICE: '0' },
    { OPAX_VARIANT: 'e2e', OPAX_HIDE_COMMUNITY: '1' },
  ]) {
    expect([env, entryFor(env)]).toEqual([
      env,
      resolve(root, 'src/features/community/entry.production.ts'),
    ]);
    const list = blockList(env);
    for (const path of communityFiles)
      expect([env, path, blocked(list, path)]).toEqual([env, path, true]);
    for (const path of [
      'src/features/community/entry.production.ts',
      'src/features/today/ExploreGrid.tsx',
      'src/features/ask/sync.ts',
    ])
      expect([env, path, blocked(list, path)]).toEqual([env, path, false]);
  }
});

test('development and e2e builds keep Community, so its journeys still run', () => {
  for (const variant of ['development', 'e2e']) {
    expect(entryFor({ OPAX_VARIANT: variant })).toBe(
      resolve(root, 'src/features/community/entry.ts'),
    );
    const list = blockList({ OPAX_VARIANT: variant });
    for (const path of communityFiles) expect(blocked(list, path)).toBe(false);
  }
});

test('the switch accepts only 0 or 1', () => {
  expect(() =>
    metro(
      { OPAX_VARIANT: 'e2e', OPAX_HIDE_COMMUNITY: 'yes' },
      'require("./metro.config.js")',
    ),
  ).toThrow(/OPAX_HIDE_COMMUNITY must be 0 or 1/);
});

test('the block rules are in the production list the release verifier reads', () => {
  const rules = JSON.parse(
    readFileSync(resolve(root, 'scripts/production-block-list.json'), 'utf8'),
  ) as string[];
  expect(rules.filter((rule) => /community/.test(rule))).toEqual([
    '[/\\\\]src[/\\\\]app[/\\\\]community[/\\\\].*',
    '[/\\\\]src[/\\\\]features[/\\\\]community[/\\\\](?!entry\\.production\\.ts$).*',
  ]);
});

test('the stub stands in for every name the app imports from the entry', () => {
  const real = jest.requireActual<Record<string, unknown>>(
    '../src/features/community/entry',
  );
  expect(Object.keys(shipped).sort()).toEqual(Object.keys(real).sort());
  expect(real.communityHome).toBe('/community/home');
  expect(shipped.communityHome).toBeNull();
});

function words(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(NativeText)
    .map((node) => node.props.children)
    .flat(Infinity)
    .filter((child) => typeof child === 'string')
    .join('\n');
}
const ids = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAll((node) => typeof node.props.testID === 'string')
    .map((node) => node.props.testID as string);

test('Today has no Community tile; every other way in stays', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ExploreGrid />);
  });
  expect(ids(renderer)).not.toContain('today-community');
  expect(words(renderer)).not.toContain('Community');
  for (const id of [
    'today-leads-open',
    'today-money-map',
    'today-public-money',
    'today-reports',
    'today-explore-open',
    'today-records-open',
  ])
    expect(ids(renderer)).toContain(id);
  act(() => renderer.unmount());
});

test('Account has no Community row, and its copy does not offer Community', async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<AccountScreen />);
  });
  expect(ids(renderer)).not.toContain('account-community');
  expect(ids(renderer)).toContain('account-about');
  expect(words(renderer)).not.toMatch(/\bCommunity\b/);
  for (const copy of [accountCopy.signedOut, accountCopy.signInIntro])
    expect(copy).not.toMatch(/community|discussion/i);
  act(() => renderer.unmount());
});

test('no deep link, web link or request reaches a Community screen', () => {
  for (const path of [
    'opax://community/home',
    'opax://community/thread?id=abc',
    '/community/messages',
  ])
    expect(redirectSystemPath({ path, initial: true })).toBe('/');
  // Other links keep the router's handling.
  expect(
    redirectSystemPath({ path: 'opax://bill/au-federal-r7534', initial: true }),
  ).toBe('opax://bill/au-federal-r7534');
  for (const path of [
    '/community',
    '/community?view=thread&id=abc',
    '/community?view=messages',
  ])
    expect(fromWebPath(path)).toBeNull();
  expect(() => canonicalUrl('/community')).toThrow();
  expect(() => assertAllowedPath('/api/community/threads')).toThrow(
    'Route is outside the public catalog allow-list',
  );
  // Ask's own account sync is a separate native route and stays.
  expect(fromWebPath('/bill/au-federal-r7534')).toEqual(
    expect.objectContaining({ pathname: '/bill/[key]' }),
  );
});
