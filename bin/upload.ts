import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import figlet from 'figlet';
import upload from './utils/uploadToIpfsSplit';
import fs from 'fs';
import CryptoJS from 'crypto-js';

// get from environment variables
const URL = process.env.IPFS_PREVIEW_URL;
const secretKey = process.env.SECRET_KEY;

// encrypt the hash
function encryptHash(hash: string, key: string | undefined): string {
  try {
    if (!key) {
      throw new Error('Secret key not found');
    }
    const encrypted = CryptoJS.RC4.encrypt(hash, key).toString();
    const urlSafe = encrypted
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return urlSafe;
  } catch (error: any) {
    console.error(`Encryption error: ${error.message}`);
    return hash;
  }
}

// create a synchronous path check function
function checkPathSync(inputPath: string): string | null {
  try {
    // convert to absolute path
    const absolutePath = path.resolve(inputPath);

    // check if the path exists
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
    return null;
  } catch (error: any) {
    console.error(chalk.red(`error checking path: ${error.message}`));
    return null;
  }
}

interface UploadOptions {
  [key: string]: any;
}

export default async (options?: UploadOptions): Promise<void> => {
  try {
    console.log(
      figlet.textSync('PINME', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
        width: 180,
        whitespaceBreak: true,
      }),
    );

    // if the parameter is passed, upload directly, pinme upload /path/to/dir
    const argPath = process.argv[3];

    if (argPath && !argPath.startsWith('-')) {
      // use the synchronous path check function
      const absolutePath = checkPathSync(argPath);
      if (!absolutePath) {
        console.log(chalk.red(`path ${argPath} does not exist`));
        return;
      }

      console.log(chalk.blue(`uploading ${absolutePath} to ipfs...`));
      try {
        const result = await upload(absolutePath);
        if (result) {
          const encryptedCID = encryptHash(result.contentHash, secretKey);
          console.log(
            chalk.cyan(
              figlet.textSync('Successful', { horizontalLayout: 'full' }),
            ),
          );
          console.log(chalk.cyan(`URL:`));
          console.log(chalk.cyan(`${URL}${encryptedCID}`));
          console.log(chalk.green('\n🎉 upload successful, program exit'));
        }
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(0);
    }

    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'path',
        message: 'path to upload: ',
      },
    ]);

    if (answer.path) {
      // use the synchronous path check function
      const absolutePath = checkPathSync(answer.path);
      if (!absolutePath) {
        console.log(chalk.red(`path ${answer.path} does not exist`));
        return;
      }

      console.log(chalk.blue(`uploading ${absolutePath} to ipfs...`));
      try {
        const result = await upload(absolutePath);

        if (result) {
          const encryptedCID = encryptHash(result.contentHash, secretKey);
          console.log(
            chalk.cyan(
              figlet.textSync('Successful', { horizontalLayout: 'full' }),
            ),
          );
          console.log(chalk.cyan(`URL:`));
          console.log(chalk.cyan(`${URL}${encryptedCID}`));
          console.log(chalk.green('\n🎉 upload successful, program exit'));
        }
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(0);
    }
  } catch (error: any) {
    console.error(chalk.red(`error executing: ${error.message}`));
    console.error(error.stack);
  }
};
