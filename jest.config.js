module.exports = {
  watchPathIgnorePatterns: ['.+fixtures.+', '_ignore_'],
  coveragePathIgnorePatterns: ['node_modules', '.+fixtures.+'],
  testPathIgnorePatterns: ['/node_modules/', '.+fixtures.+', '_ignore_'],
  testEnvironment: 'node',
};
