// Mock for fs-extra

const fs = {
  existsSync: jest.fn((path: string) => false),
  readFileSync: jest.fn((path: string) => ''),
  writeFileSync: jest.fn(),
  removeSync: jest.fn(),
  copySync: jest.fn(),
  statSync: jest.fn(() => ({ size: 1000 })),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(() => []),
  rmdirSync: jest.fn(),
};

export default fs;
