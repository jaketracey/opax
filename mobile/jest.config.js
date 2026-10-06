module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/tests/native-map-mocks.js'],
  testMatch: ['<rootDir>/tests/**/*.test.ts?(x)'],
  collectCoverageFrom: ['src/api/**/*.ts', 'src/design/**/*.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '/private/', '/build/'],
};
