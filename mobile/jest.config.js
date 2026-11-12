module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: [
    '<rootDir>/tests/hermes-runtime.js',
    '<rootDir>/tests/native-map-mocks.js',
    '<rootDir>/tests/renderer-cleanup.js',
  ],
  testMatch: ['<rootDir>/tests/**/*.test.ts?(x)'],
  collectCoverageFrom: ['src/api/**/*.ts', 'src/design/**/*.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '/private/', '/build/'],
};
