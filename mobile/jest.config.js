module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^expo-image$': '<rootDir>/tests/mocks/expo-image.js',
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts?(x)'],
  collectCoverageFrom: ['src/api/**/*.ts', 'src/design/**/*.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '/private/', '/build/'],
};
