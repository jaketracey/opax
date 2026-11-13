// Node 24's V8 can segfault in GC (ClearStaleLeftTrimmedPointerVisitor) on a
// stale Sparkplug frame slot: nodejs/node#62393. npm test runs Jest under
// `node --no-sparkplug` (scripts/jest-retry.sh); a plain `npx jest` does not,
// and on 13 Nov a review's `npx jest --maxWorkers=6` lost a worker to SIGSEGV.
// Jest forks its workers with process.execArgv after reading this config, so
// they get the flag here. In-band runs execute in the already started main
// process, which only npm test protects: use `npm test -- <args>`.
if (!process.execArgv.includes('--no-sparkplug'))
  process.execArgv.push('--no-sparkplug');

module.exports = {
  preset: 'jest-expo',
  // A default in config lets an explicit CLI worker budget take precedence.
  maxWorkers: 2,
  // Bounds every synchronous child process a suite starts (see the file).
  setupFiles: ['<rootDir>/tests/child-timeout.js'],
  setupFilesAfterEnv: [
    '<rootDir>/tests/hermes-runtime.js',
    '<rootDir>/tests/native-map-mocks.js',
    '<rootDir>/tests/renderer-cleanup.js',
  ],
  testMatch: ['<rootDir>/tests/**/*.test.ts?(x)'],
  collectCoverageFrom: ['src/api/**/*.ts', 'src/design/**/*.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '/private/', '/build/'],
};
