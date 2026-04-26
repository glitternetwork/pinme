import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import figlet from 'figlet';
import fs from 'fs';
import CryptoJS from 'crypto-js';
import { checkDomainAvailable, bindPinmeDomain, getRootDomain } from './utils/pinmeApi';
import { getAuthConfig } from './utils/webLogin';
import { APP_CONFIG } from './utils/config';
import { uploadPath } from './services/uploadService';
import { printHighlightedUrl } from './utils/urlDisplay';
// get from environment variables

import { checkNodeVersion } from './utils/checkNodeVersion';
checkNodeVersion();

// encrypt the hash with optional uid (device id)
function encryptHash(contentHash: string, key: string | undefined, uid?: string): string {
  try {
    if (!key) {
      throw new Error('Secret key not found');
    }
    // Combine contentHash-uid if uid exists, otherwise just contentHash (for backward compatibility)
    const combined = uid ? `${contentHash}-${uid}` : contentHash;
    const encrypted = CryptoJS.RC4.encrypt(combined, key).toString();
    const urlSafe = encrypted
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return urlSafe;
  } catch (error: any) {
    console.error(`Encryption error: ${error.message}`);
    return contentHash;
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

interface ImportOptions {
  [key: string]: any;
}

function getDomainFromArgs(): string | null {
  const args = process.argv.slice(2);
  const dIdx = args.findIndex((a) => a === '--domain' || a === '-d');
  if (dIdx >= 0 && args[dIdx + 1] && !args[dIdx + 1].startsWith('-')) {
    return String(args[dIdx + 1]).trim();
  }
  return null;
}

// Upload/import now requires login. Use the authenticated address as uid.
function getUid(): string {
  const auth = getAuthConfig();
  if (auth?.address) {
    return auth.address;
  }
  throw new Error('Please login first. Run: pinme login');
}

export default async (options?: ImportOptions): Promise<void> => {
  try {
    console.log(
      figlet.textSync('PINME IMPORT', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
        width: 180,
        whitespaceBreak: true,
      }),
    );

    const auth = getAuthConfig();
    if (!auth) {
      console.log(chalk.red('Please login first. Run: pinme login'));
      return;
    }

    // if the parameter is passed, import directly, pinme import /path/to/dir
    const argPath = process.argv[3];
    const domainArg = getDomainFromArgs();

    if (argPath && !argPath.startsWith('-')) {
      // use the synchronous path check function
      const absolutePath = checkPathSync(argPath);
      if (!absolutePath) {
        console.log(chalk.red(`path ${argPath} does not exist`));
        return;
      }

      // optional: pre-check domain availability before import
      if (domainArg) {
        const check = await checkDomainAvailable(domainArg);
        if (!check.is_valid) {
          console.log(chalk.red(`Domain not available: ${check.error || 'unknown reason'}`));
          return;
        }
        console.log(chalk.green(`Domain available: ${domainArg}`));
      }

      console.log(chalk.blue(`importing ${absolutePath} to ipfs as CAR...`));
      try {
        const result = await uploadPath(absolutePath, {
          importAsCar: true,
          uid: getUid(),
        });
        if (result) {
          const uid = getUid();
          const encryptedCID = encryptHash(result.contentHash, APP_CONFIG.secretKey, uid);
          console.log(
            chalk.cyan(
              figlet.textSync('Successful', { horizontalLayout: 'full' }),
            ),
          );
          printHighlightedUrl(
            'URL',
            `${APP_CONFIG.ipfsPreviewUrl}${encryptedCID}`,
            'primary',
          );
          // optional: bind domain after import
          if (domainArg) {
            console.log(chalk.blue(`Binding domain: ${domainArg} with CID: ${result.contentHash}`));
            const ok = await bindPinmeDomain(domainArg, result.contentHash);
            if (ok) {
              console.log(chalk.green(`Bind success: ${domainArg}`));
              const rootDomain = await getRootDomain();
              console.log(chalk.white(`Visit (Pinme subdomain example): https://${domainArg}.${rootDomain}`));
            } else {
              console.log(chalk.red('Binding failed. Please try again later.'));
            }
          }
          console.log(chalk.green('\n🎉 import successful, program exit'));
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
        message: 'path to import: ',
      },
    ]);

    if (answer.path) {
      // use the synchronous path check function
      const absolutePath = checkPathSync(answer.path);
      if (!absolutePath) {
        console.log(chalk.red(`path ${answer.path} does not exist`));
        return;
      }

      // optional: interactive flow may also parse --domain, reuse the same arg parsing
      if (domainArg) {
        const check = await checkDomainAvailable(domainArg);
        if (!check.is_valid) {
          console.log(chalk.red(`Domain not available: ${check.error || 'unknown reason'}`));
          return;
        }
        console.log(chalk.green(`Domain available: ${domainArg}`));
      }

      console.log(chalk.blue(`importing ${absolutePath} to ipfs as CAR...`));
      try {
        const result = await uploadPath(absolutePath, {
          importAsCar: true,
          uid: getUid(),
        });

        if (result) {
          const uid = getUid();
          const encryptedCID = encryptHash(result.contentHash, APP_CONFIG.secretKey, uid);
          console.log(
            chalk.cyan(
              figlet.textSync('Successful', { horizontalLayout: 'full' }),
            ),
          );
          printHighlightedUrl(
            'URL',
            `${APP_CONFIG.ipfsPreviewUrl}${encryptedCID}`,
            'primary',
          );
          if (domainArg) {
            console.log(chalk.blue(`Binding domain: ${domainArg} with CID: ${result.contentHash}`));
            const ok = await bindPinmeDomain(domainArg, result.contentHash);
            if (ok) {
              console.log(chalk.green(`Bind success: ${domainArg}`));
              const rootDomain = await getRootDomain();
              console.log(chalk.white(`Visit (Pinme subdomain example): https://${domainArg}.${rootDomain}`));
            } else {
              console.log(chalk.red('Binding failed. Please try again later.'));
            }
          }
          console.log(chalk.green('\n🎉 import successful, program exit'));
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
