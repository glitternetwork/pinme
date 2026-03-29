/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/bin'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'bin/**/*.ts',
    '!bin/**/*.test.ts',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  setupFiles: ['<rootDir>/bin/jestSetup.ts'],
  moduleNameMapper: {
    '^chalk$': '<rootDir>/bin/__mocks__/chalk.ts',
    '^inquirer$': '<rootDir>/bin/__mocks__/inquirer.ts',
    '^axios$': '<rootDir>/bin/__mocks__/axios.ts',
    '^fs-extra$': '<rootDir>/bin/__mocks__/fs-extra.ts',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        types: ['jest', 'node'],
      },
    },
  },
};
