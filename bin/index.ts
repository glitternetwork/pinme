import dotenv from 'dotenv';

dotenv.config();

import { checkNodeVersion } from './utils/checkNodeVersion';
checkNodeVersion();

import { Command } from "commander";
import chalk from "chalk";
import figlet from "figlet";
import { version } from '../package.json';

import upload from './upload';
import remove from './remove';
import { displayUploadHistory, clearUploadHistory } from './utils/history';

// display the ASCII art logo
function showBanner(): void {
  console.log(
    chalk.cyan(
      figlet.textSync("Pinme", { horizontalLayout: "full" })
    )
  );
  console.log(chalk.cyan("A command-line tool for uploading files to IPFS\n"));
}

const program = new Command();

program
    .name("pinme")
    .version(version)
    .option('-v, --version', 'output the current version');

program
    .command('upload')
    .description("upload a file or directory to IPFS")
    .action(() => upload());

program
    .command('rm')
    .description("remove a file from IPFS network")
    .action(() => remove());

program
    .command('list')
    .description("show upload history")
    .option('-l, --limit <number>', 'limit the number of records to show', parseInt)
    .option('-c, --clear', 'clear all upload history')
    .action((options: { limit?: number, clear?: boolean }) => {
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
    .option('-l, --limit <number>', 'limit the number of records to show', parseInt)
    .option('-c, --clear', 'clear all upload history')
    .action((options: { limit?: number, clear?: boolean }) => {
      if (options.clear) {
        clearUploadHistory();
      } else {
        displayUploadHistory(options.limit || 10);
      }
    });

// add help command
program
    .command('help')
    .description("display help information")
    .action(() => {
      showBanner();
      program.help();
    });

// custom help output format
program.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('  $ pinme upload');
  console.log('  $ pinme rm <hash>');
  console.log('  $ pinme list -l 5');
  console.log('  $ pinme ls');
  console.log('  $ pinme help');
  console.log('');
  console.log('For more information, visit: https://github.com/glitternetwork/pinme');
});

// parse the command line arguments
program.parse(process.argv);

// If no arguments provided, show banner and help
if (process.argv.length === 2) {
  showBanner();
  program.help();
} 