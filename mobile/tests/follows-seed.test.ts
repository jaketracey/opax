import { Platform } from 'react-native';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { apiClient } from '../src/api/runtime';
import * as environment from '../src/design/environment';
import { allowedURL } from '../src/api/policy';
import { seededFollows } from '../src/features/follows/launch-fixture';
import { seededFollows as productionSeed } from '../src/features/follows/launch-fixture.production';
import { followFixturePath as productionPath } from '../src/api/follow-fixture-path.production';
import {
  follow,
  loadFollows,
  resetFollowsForTests,
  unfollow,
} from '../src/features/follows/store';

const mockDisk = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    name: string;
    constructor(_directory: unknown, name: string) {
      this.name = name;
    }
    get exists() {
      return mockDisk.has(this.name);
    }
    async text() {
      return mockDisk.get(this.name)!;
    }
    write(body: string) {
      mockDisk.set(this.name, body);
    }
  },
}));
jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../src/design/environment', () => ({
  __esModule: true,
  isE2E: true,
}));
const seed = Array.from({ length: 50 }, (_, i) => ({
  kind: 'person',
  id: `person_${String(i + 1).padStart(24, '0')}`,
  title: `Fixture member ${i + 1}`,
  followedAt: 1791072000000,
  seen: null,
  seenAt: null,
}));
const os = Platform.OS;
beforeEach(() => {
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  mockDisk.clear();
  resetFollowsForTests();
  jest.mocked(apiClient.get).mockImplementation(async (_path, decode) => ({
    data: decode({ version: 1, follows: seed }),
    savedAt: 1,
    stale: false,
    asOf: null,
  }));
});
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
test('Android seeds a new e2e install to the limit, persists edits and does not reseed', async () => {
  expect(await loadFollows()).toEqual(seed);
  const added = {
    kind: 'person' as const,
    id: 'person_ffffffffffffffffffffffff',
    title: 'Fixture extra member',
  };
  expect(await follow(added)).toBe('limit');
  await unfollow('person:person_000000000000000000000001');
  expect(await follow(added)).toBe('followed');
  await unfollow('person:person_000000000000000000000002');
  resetFollowsForTests();
  expect(await loadFollows()).toHaveLength(49);
  expect(apiClient.get).toHaveBeenCalledTimes(1);
});
test('ordinary and production builds never request the seed', async () => {
  jest.replaceProperty(environment, 'isE2E', false);
  expect(await seededFollows()).toBeNull();
  expect(productionSeed()).toBeNull();
  expect(productionPath).toBeNull();
  expect(apiClient.get).not.toHaveBeenCalled();
});
test('fixture reads cannot use a public origin or a lookalike local origin', () => {
  expect(allowedURL('http://10.0.2.2:8920', '/__fixture/follows')).toBe(
    'http://10.0.2.2:8920/__fixture/follows',
  );
  for (const origin of [
    'https://opax.com.au',
    'http://10.0.2.3:8920',
    'http://10.0.2.2:8888',
    'https://10.0.2.2:8920',
  ]) {
    expect(() => allowedURL(origin, '/__fixture/follows')).toThrow();
  }
});

test.each(['production', 'e2e'])(
  '%s resolves both seed modules at build time',
  (variant) => {
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        `
    const path = require('node:path');
    const config = require('./metro.config.js');
    const modules = [
      ['src/features/follows', './launch-fixture'],
      ['src/api', './follow-fixture-path'],
    ];
    process.stdout.write(JSON.stringify(modules.map(([directory, name]) => {
      const context = {
        originModulePath: path.resolve(directory, 'store.ts'),
        resolveRequest: (_context, name) => ({ type: 'sourceFile', filePath: path.resolve(directory, name + '.ts') }),
      };
      return config.resolver.resolveRequest(context, name, 'android').filePath;
    })));
  `,
      ],
      {
        cwd: resolve(__dirname, '..'),
        env: { ...process.env, OPAX_VARIANT: variant },
        encoding: 'utf8',
      },
    );
    expect(JSON.parse(output)).toEqual([
      resolve(
        __dirname,
        `../src/features/follows/launch-fixture${variant === 'production' ? '.production' : ''}.ts`,
      ),
      resolve(
        __dirname,
        `../src/api/follow-fixture-path${variant === 'production' ? '.production' : ''}.ts`,
      ),
    ]);
  },
);
