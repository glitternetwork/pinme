import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import figlet from 'figlet';
import fs from 'fs';
import { checkDomainAvailable, bindPinmeDomain, bindDnsDomainV4, getWalletBalance } from './utils/pinmeApi';
import { getAuthConfig } from './utils/webLogin';
import { APP_CONFIG } from './utils/config';
import { isDnsDomain, normalizeDomain, validateDnsDomain } from './utils/domainValidator';
import { resolveUploadUrls, uploadPath } from './services/uploadService';

import { checkNodeVersion } from './utils/checkNodeVersion';
checkNodeVersion();

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

async function printUploadUrls(contentHash: string, shortUrl?: string): Promise<void> {
  const projectName = APP_CONFIG.pinmeProjectName;
  const { publicUrl, managementUrl } = await resolveUploadUrls(contentHash, shortUrl);

  if (projectName) {
    console.log(chalk.cyan(`URL:`));
    console.log(chalk.cyan(publicUrl));
    console.log(chalk.cyan(`Management page:`));
    console.log(chalk.cyan(managementUrl));
    return;
  }

  console.log(chalk.cyan(`URL:`));
  console.log(chalk.cyan(publicUrl));
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

async function checkWalletBalanceStatus(authConfig: { address: string; token: string }): Promise<boolean> {
  console.log(chalk.blue('Checking wallet balance...'));
  try {
    const balanceResult = await getWalletBalance(authConfig.address, authConfig.token);
    const balance = Number(balanceResult.data?.wallet_balance_usd ?? 0);
    if (!Number.isFinite(balance) || balance <= 0) {
      return false;
    }
    console.log(chalk.green(`Wallet balance available: $${balance.toFixed(2)}`));
    return true;
  } catch (e: any) {
    if (e.message === 'Token expired') {
      throw e;
    }
    console.log(chalk.yellow('Failed to check wallet balance, continuing...'));
    return true;
  }
}

async function bindDomain(
  domain: string,
  contentHash: string,
  isDns: boolean,
  authConfig: { address: string; token: string },
): Promise<boolean> {
  const displayDomain = normalizeDomain(domain);

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
    const rootDomain = await (await import('./utils/pinmeApi')).getRootDomain();
    console.log(chalk.white(`Visit: https://${displayDomain}.${rootDomain}`));
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

    // Check if domain/dns options are provided
    const domainArg = getDomainFromArgs();
    const dnsArg = getDnsFromArgs();
    const needsAuth = !!domainArg || dnsArg;

    // Check auth only when domain/dns options are provided
    const authConfig = getAuthConfig();
    if (needsAuth && !authConfig) {
      console.log(chalk.red('Please login first. Run: pinme set-appkey <AppKey>'));
      return;
    }

    // if the parameter is passed, upload directly, pinme upload /path/to/dir
    const argPath = process.argv[3];

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

      // Domain binding now uses wallet balance instead of VIP.
      if (domainArg) {
        try {
          const hasWalletBalance = await checkWalletBalanceStatus(authConfig);
          if (!hasWalletBalance) {
            console.log(chalk.red('Insufficient wallet balance. Please recharge your wallet first.'));
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
      let result;
      try {
        result = await uploadPath(absolutePath, {
          projectName: APP_CONFIG.pinmeProjectName,
          uid: authConfig?.address,
        });
      } catch (error: any) {
        console.error(chalk.red(`Upload error: ${error.message}`));
        process.exit(1);
      }

      if (!result) {
        console.error(chalk.red('Upload failed: no result returned'));
        process.exit(1);
      }

      console.log(
        chalk.cyan(
          figlet.textSync('Successful', { horizontalLayout: 'full' }),
        ),
      );
      await printUploadUrls(result.contentHash, result.shortUrl);

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
            process.exit(1);
          }
          throw e;
        }
      }
      console.log(chalk.green('\n🎉 upload successful, program exit'));
      process.exit(0);
    }

    // No path argument provided, use interactive mode
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

      // Domain binding now uses wallet balance instead of VIP.
      if (domainArg) {
        try {
          const hasWalletBalance = await checkWalletBalanceStatus(authConfig);
          if (!hasWalletBalance) {
            console.log(chalk.red('Insufficient wallet balance. Please recharge your wallet first.'));
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
      let result;
      try {
        result = await uploadPath(absolutePath, {
          projectName: APP_CONFIG.pinmeProjectName,
          uid: authConfig?.address,
        });
      } catch (error: any) {
        console.error(chalk.red(`Upload error: ${error.message}`));
        process.exit(1);
      }

      if (!result) {
        console.error(chalk.red('Upload failed: no result returned'));
        process.exit(1);
      }

      console.log(
        chalk.cyan(
          figlet.textSync('Successful', { horizontalLayout: 'full' }),
        ),
      );
      await printUploadUrls(result.contentHash, result.shortUrl);
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
            process.exit(1);
          }
          throw e;
        }
      }
      console.log(chalk.green('\n🎉 upload successful, program exit'));
      process.exit(0);
    }
  } catch (error: any) {
    console.error(chalk.red(`error executing: ${error.message}`));
    console.error(error.stack);
  }
};
