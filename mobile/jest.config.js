module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverageFrom: ['src/api/**/*.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/private/', '/build/'],
};
