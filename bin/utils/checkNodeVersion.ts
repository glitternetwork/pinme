import chalk from 'chalk';

const MIN_NODE_VERSION = '16.13.0';

interface Version {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(version: string): Version {
  const parts = version.replace(/^v/, '').split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

function compareVersions(version1: Version, version2: Version): number {
  if (version1.major !== version2.major) {
    return version1.major - version2.major;
  }
  if (version1.minor !== version2.minor) {
    return version1.minor - version2.minor;
  }
  return version1.patch - version2.patch;
}

export function checkNodeVersion(): void {
  const currentVersion = process.version;
  const current = parseVersion(currentVersion);
  const minimum = parseVersion(MIN_NODE_VERSION);
  
  if (compareVersions(current, minimum) < 0) {
    console.error(chalk.red('❌ Node.js version requirement not met'));
    console.error(chalk.yellow(`Current version: ${currentVersion}`));
    console.error(chalk.yellow(`Required version: >= ${MIN_NODE_VERSION}`));
    console.error('');
    console.error(chalk.cyan('Please upgrade Node.js to version 16.13.0 or higher.'));
    console.error(chalk.cyan('Download from: https://nodejs.org/'));
    console.error('');
    process.exit(1);
  }
}

export function checkNodeVersionWithMessage(): void {
  const currentVersion = process.version;
  const current = parseVersion(currentVersion);
  const minimum = parseVersion(MIN_NODE_VERSION);
  
  if (compareVersions(current, minimum) < 0) {
    console.log(chalk.red('❌ Node.js version requirement not met'));
    console.log(chalk.yellow(`Current version: ${currentVersion}`));
    console.log(chalk.yellow(`Required version: >= ${MIN_NODE_VERSION}`));
    console.log('');
    console.log(chalk.cyan('Please upgrade Node.js to version 16.13.0 or higher.'));
    console.log(chalk.cyan('Download from: https://nodejs.org/'));
    console.log('');
    process.exit(1);
  }
}
