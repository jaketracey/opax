import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockArgs: Record<string, string> = {};
let mockE2E = true;
// Jest has no native SettingsManager; the app reads the launch argument there.
jest.mock('react-native/Libraries/Settings/Settings', () => ({
  __esModule: true,
  default: { get: (key: string) => mockArgs[key], set: () => undefined },
}));
jest.mock('../src/design/environment', () => ({
  get isE2E() {
    return mockE2E;
  },
}));

const load = () =>
  jest.requireActual(
    '../src/features/learn/launch-fixture',
  ) as typeof import('../src/features/learn/launch-fixture');

beforeEach(() => {
  for (const key of Object.keys(mockArgs)) delete mockArgs[key];
  mockE2E = true;
});

test('e2e launch arguments pin the guide card and the term switches', () => {
  expect(load().learnFixture()).toBeNull();
  mockArgs.OPAXLearnCard = 'show';
  mockArgs.OPAXTerms = 'explain';
  expect(load().learnFixture()).toEqual({ card: 'show', explain: true });
  mockArgs.OPAXTerms = 'off';
  expect(load().learnFixture()).toEqual({ card: 'show', underline: false });
});

test('outside e2e builds nothing is read, and release builds get the stub', () => {
  mockE2E = false;
  mockArgs.OPAXLearnCard = 'show';
  expect(load().learnFixture()).toBeNull();
  const metro = readFileSync(join(__dirname, '../metro.config.js'), 'utf8');
  expect(metro).toContain("'src/features/learn/launch-fixture'");
  const stub = readFileSync(
    join(__dirname, '../src/features/learn/launch-fixture.production.ts'),
    'utf8',
  );
  expect(stub).not.toMatch(/OPAX[A-Z]/);
});
