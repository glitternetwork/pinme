import dotenv from 'dotenv';

dotenv.config();

import { checkNodeVersion } from './utils/checkNodeVersion';
checkNodeVersion();

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import { version } from '../package.json';

import upload from './upload';
import importFile from './importCar';
import exportFile from './exportCar';
import remove from './remove';
import { displayUploadHistory, clearUploadHistory } from './utils/history';
import setAppKeyCmd from './set-appkey';
import logoutCmd from './logout';
import showAppKeyCmd from './show-appkey';
import myDomainsCmd from './my-domains';
import bindCmd from './bind';

// display the ASCII art logo
function showBanner(): void {
  console.log(
    chalk.cyan(figlet.textSync('Pinme', { horizontalLayout: 'full' })),
  );
  console.log(chalk.cyan('A command-line tool for uploading files to IPFS\n'));
}

const program = new Command();

program
  .name('pinme')
  .version(version)
  .option('-v, --version', 'output the current version');

program
  .command('upload')
  .description(
    'upload a file or directory to IPFS. Supports --domain to bind after upload',
  )
  .option('-d, --domain <name>', 'Domain name to bind')
  .option('--dns', 'Force DNS domain mode')
  .action(() => upload());

program
  .command('import')
  .description("import a CAR file to IPFS. Supports --domain to bind after import")
  .option('-d, --domain <name>', 'Pinme subdomain')
  .action(() => importFile());

program
  .command('export')
  .description('export IPFS content as CAR file')
  .option('-o, --output <path>', 'output file path for CAR file')
  .action(() => exportFile());

program
  .command('rm')
  .description('remove a file from IPFS network')
  .action(() => remove());

program
  .command('set-appkey')
  .description(
    'Set AppKey for authentication, and auto-merge anonymous history',
  )
  .action(() => setAppKeyCmd());

program
  .command('logout')
  .description('log out and clear authentication')
  .action(() => logoutCmd());

program
  .command('show-appkey')
  .alias('appkey')
  .description('show current AppKey information (masked)')
  .action(() => showAppKeyCmd());

program
  .command('my-domains')
  .alias('domain')
  .description('List domains owned by current account')
  .action(() => myDomainsCmd());

program
  .command('bind')
  .description('Upload and bind to a domain (requires VIP)')
  .option('-d, --domain <name>', 'Domain name to bind')
  .option('--dns', 'Force DNS domain mode')
  .action(() => bindCmd());

program
  .command('domain')
  .description("Alias for 'my-domains' command")
  .action(() => myDomainsCmd());

program
  .command('list')
  .description('show upload history')
  .option(
    '-l, --limit <number>',
    'limit the number of records to show',
    parseInt,
  )
  .option('-c, --clear', 'clear all upload history')
  .action((options: { limit?: number; clear?: boolean }) => {
    if (options.clear) {
      clearUploadHistory();
    } else {
      displayUploadHistory(options.limit || 10);
    }
  });

// add ls command as an alias for list command
program
  .command('ls')
  .description("alias for 'list' command")
  .option(
    '-l, --limit <number>',
    'limit the number of records to show',
    parseInt,
  )
  .option('-c, --clear', 'clear all upload history')
  .action((options: { limit?: number; clear?: boolean }) => {
    if (options.clear) {
      clearUploadHistory();
    } else {
      displayUploadHistory(options.limit || 10);
    }
  });

// add help command
program
  .command('help')
  .description('display help information')
  .action(() => {
    showBanner();
    program.help();
  });

// custom help output format
program.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('  $ pinme upload');
  console.log('  $ pinme upload <path> --domain <name>');
  console.log('  $ pinme import');
  console.log('  $ pinme import <path> --domain <name>');
  console.log('  $ pinme export <cid> --output <path>');
  console.log('  $ pinme rm <hash>');
  console.log('  $ pinme set-appkey <AppKey>');
  console.log('  $ pinme show-appkey');
  console.log('  $ pinme logout');
  console.log('  $ pinme my-domains');
  console.log('  $ pinme domain');
  console.log('  $ pinme list -l 5');
  console.log('  $ pinme ls');
  console.log('  $ pinme help');
  console.log('');
  console.log(
    'For more information, visit: https://github.com/glitternetwork/pinme',
  );
});

// parse the command line arguments
program.parse(process.argv);

// If no arguments provided, show banner and help
if (process.argv.length === 2) {
  showBanner();
  program.help();
}
