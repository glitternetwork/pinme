import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import figlet from 'figlet';
import upload from './utils/uploadToIpfsSplit';
import fs from 'fs';
import CryptoJS from 'crypto-js';
import { checkDomainAvailable, bindPinmeDomain, bindDnsDomainV4, isVip } from './utils/pinmeApi';
import { getUid } from './utils/getDeviceId';
import { getAuthConfig } from './utils/auth';

// get from environment variables
const URL = process.env.IPFS_PREVIEW_URL;
const secretKey = process.env.SECRET_KEY;

import { checkNodeVersion } from './utils/checkNodeVersion';
checkNodeVersion();

// Check if a domain is a DNS domain (contains a dot)
function isDnsDomain(domain: string): boolean {
  return domain.includes('.');
}

// Validate DNS domain format
function validateDnsDomain(domain: string): { valid: boolean; message?: string } {
  // Remove protocol if present
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Check for valid domain format
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)*\.[a-zA-Z]{2,}$/;
  const parts = cleanDomain.split('.');

  // Check each part
  if (parts.length < 2) {
    return { valid: false, message: 'Invalid domain format. Please enter a complete domain (e.g., example.com)' };
  }

  // Check each label (part between dots)
  for (const part of parts) {
    if (part.length === 0) {
      return { valid: false, message: 'Invalid domain format. Consecutive dots are not allowed' };
    }
    if (part.length > 63) {
      return { valid: false, message: 'Invalid domain format. Each label must be 63 characters or less' };
    }
    if (!/^[a-zA-Z0-9-]+$/.test(part)) {
      return { valid: false, message: 'Invalid domain format. Domains can only contain letters, numbers, and hyphens' };
    }
    if (/^-|-$/.test(part)) {
      return { valid: false, message: 'Invalid domain format. Labels cannot start or end with hyphens' };
    }
  }

  if (!domainRegex.test(cleanDomain)) {
    return { valid: false, message: 'Invalid domain format' };
  }

  return { valid: true };
}

// encrypt the hash with optional uid (device id)
function encryptHash(
  contentHash: string,
  key: string | undefined,
  uid?: string,
): string {
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

interface UploadOptions {
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

function getDnsFromArgs(): boolean {
  const args = process.argv.slice(2);
  return args.includes('--dns') || args.includes('-D');
}

async function checkVipStatus(authConfig: { address: string; token: string }): Promise<boolean> {
  console.log(chalk.blue('Checking VIP status...'));
  try {
    const vipResult = await isVip(authConfig.address, authConfig.token);
    if (!vipResult.data?.is_vip) {
      return false;
    }
    console.log(chalk.green('VIP verified.'));
    return true;
  } catch (e: any) {
    if (e.message === 'Token expired') {
      throw e;
    }
    console.log(chalk.yellow('Failed to check VIP status, continuing...'));
    return true;
  }
}

async function bindDomain(
  domain: string,
  contentHash: string,
  isDns: boolean,
  authConfig: { address: string; token: string },
): Promise<boolean> {
  const displayDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

  if (isDns) {
    // DNS domain binding
    console.log(chalk.blue('Binding DNS domain...'));
    const dnsResult = await bindDnsDomainV4(displayDomain, contentHash, authConfig.address, authConfig.token);
    if (dnsResult.code !== 200) {
      console.log(chalk.red(`DNS binding failed: ${dnsResult.msg}`));
      return false;
    }
    console.log(chalk.green(`DNS bind success: ${displayDomain}`));
    console.log(chalk.white(`Visit: https://${displayDomain}`));
    console.log(chalk.cyan('\n📚 DNS Setup Guide: https://pinme.eth.limo/#/docs?id=custom-domain'));
  } else {
    // Pinme subdomain binding
    console.log(chalk.blue('Binding Pinme subdomain...'));
    const ok = await bindPinmeDomain(displayDomain, contentHash);
    if (!ok) {
      console.log(chalk.red('Binding failed. Please try again later.'));
      return false;
    }
    console.log(chalk.green(`Bind success: ${displayDomain}`));
    console.log(chalk.white(`Visit: https://${displayDomain}.pinit.eth.limo`));
  }
  return true;
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

    // Check auth
    const authConfig = getAuthConfig();
    if (!authConfig) {
      console.log(chalk.red('Please login first. Run: pinme set-appkey <AppKey>'));
      return;
    }

    // if the parameter is passed, upload directly, pinme upload /path/to/dir
    const argPath = process.argv[3];
    const domainArg = getDomainFromArgs();
    const dnsArg = getDnsFromArgs();

    if (argPath && !argPath.startsWith('-')) {
      // use the synchronous path check function
      const absolutePath = checkPathSync(argPath);
      if (!absolutePath) {
        console.log(chalk.red(`path ${argPath} does not exist`));
        return;
      }

      // Auto-detect domain type
      const isDns = dnsArg || (domainArg ? isDnsDomain(domainArg) : false);
      const displayDomain = domainArg?.replace(/^https?:\/\//, '').replace(/\/$/, '');

      // Validate DNS domain format
      if (isDns && domainArg) {
        const validation = validateDnsDomain(domainArg);
        if (!validation.valid) {
          console.log(chalk.red(validation.message!));
          return;
        }
      }

      // Domain binding requires VIP
      if (domainArg) {
        try {
          const isVipUser = await checkVipStatus(authConfig);
          if (!isVipUser) {
            console.log(chalk.red('Domain binding requires VIP. Please upgrade to VIP first.'));
            return;
          }
        } catch (e: any) {
          if (e.message === 'Token expired') {
            return;
          }
          throw e;
        }
      }

      // optional: pre-check domain availability before upload
      if (domainArg) {
        try {
          const check = await checkDomainAvailable(displayDomain!);
          if (!check.is_valid) {
            console.log(
              chalk.red(
                `Domain not available: ${check.error || 'unknown reason'}`,
              ),
            );
            return;
          }
          console.log(chalk.green(`Domain available: ${displayDomain}`));
        } catch (e: any) {
          if (e.message === 'Token expired') {
            return;
          }
          throw e;
        }
      }

      console.log(chalk.blue(`uploading ${absolutePath} to ipfs...`));
      try {
        const result = await upload(absolutePath);
        if (result) {
          const uid = getUid();
          const encryptedCID = encryptHash(result.contentHash, secretKey, uid);
          console.log(
            chalk.cyan(
              figlet.textSync('Successful', { horizontalLayout: 'full' }),
            ),
          );
          console.log(chalk.cyan(`URL:`));
          console.log(chalk.cyan(`${URL}${encryptedCID}`));

          // optional: bind domain after upload
          if (domainArg) {
            console.log(
              chalk.blue(
                `Binding domain: ${displayDomain} with CID: ${result.contentHash}`,
              ),
            );
            try {
              await bindDomain(domainArg, result.contentHash, isDns, authConfig);
            } catch (e: any) {
              if (e.message === 'Token expired') {
                return;
              }
              throw e;
            }
          }
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

      // Auto-detect domain type
      const isDns = dnsArg || (domainArg ? isDnsDomain(domainArg) : false);
      const displayDomain = domainArg?.replace(/^https?:\/\//, '').replace(/\/$/, '');

      // Validate DNS domain format
      if (isDns && domainArg) {
        const validation = validateDnsDomain(domainArg);
        if (!validation.valid) {
          console.log(chalk.red(validation.message!));
          return;
        }
      }

      // Domain binding requires VIP
      if (domainArg) {
        try {
          const isVipUser = await checkVipStatus(authConfig);
          if (!isVipUser) {
            console.log(chalk.red('Domain binding requires VIP. Please upgrade to VIP first.'));
            return;
          }
        } catch (e: any) {
          if (e.message === 'Token expired') {
            return;
          }
          throw e;
        }
      }

      // optional: interactive flow may also parse --domain, reuse the same arg parsing
      if (domainArg) {
        try {
          const check = await checkDomainAvailable(displayDomain!);
          if (!check.is_valid) {
            console.log(
              chalk.red(
                `Domain not available: ${check.error || 'unknown reason'}`,
              ),
            );
            return;
          }
          console.log(chalk.green(`Domain available: ${displayDomain}`));
        } catch (e: any) {
          if (e.message === 'Token expired') {
            return;
          }
          throw e;
        }
      }

      console.log(chalk.blue(`uploading ${absolutePath} to ipfs...`));
      try {
        const result = await upload(absolutePath);

        if (result) {
          const uid = getUid();
          const encryptedCID = encryptHash(result.contentHash, secretKey, uid);
          console.log(
            chalk.cyan(
              figlet.textSync('Successful', { horizontalLayout: 'full' }),
            ),
          );
          console.log(chalk.cyan(`URL:`));
          console.log(chalk.cyan(`${URL}${encryptedCID}`));
          if (domainArg) {
            console.log(
              chalk.blue(
                `Binding domain: ${displayDomain} with CID: ${result.contentHash}`,
              ),
            );
            try {
              await bindDomain(domainArg, result.contentHash, isDns, authConfig);
            } catch (e: any) {
              if (e.message === 'Token expired') {
                return;
              }
              throw e;
            }
          }
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
