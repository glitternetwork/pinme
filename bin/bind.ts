import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { checkDomainAvailable, bindPinmeDomain, bindDnsDomainV4, getRootDomain, getWalletBalance } from './utils/pinmeApi';
import { printCliError } from './utils/cliError';
import { getWalletRechargeUrl } from './utils/config';
import { getAuthConfig } from './utils/webLogin';
import { isDnsDomain, normalizeDomain, validateDnsDomain } from './utils/domainValidator';
import { uploadPath } from './services/uploadService';

interface Args {
  domain?: string;
  targetPath?: string;
  dns?: boolean;
}


function parseArgs(): Args {
  // Usage: pinme bind <path> --domain <name> [--dns]
  const args = process.argv.slice(2);
  const res: Args = {};
  const idx = args.indexOf('bind');
  if (idx >= 0) {
    const maybePath = args[idx + 1];
    if (maybePath && !maybePath.startsWith('-')) res.targetPath = maybePath;
  }
  const dIdx = args.findIndex((a) => a === '--domain' || a === '-d');
  if (dIdx >= 0 && args[dIdx + 1]) {
    res.domain = args[dIdx + 1];
  }
  const dnsIdx = args.findIndex((a) => a === '--dns' || a === '-D');
  if (dnsIdx >= 0) {
    res.dns = true;
  }
  return res;
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
    if (e.message === 'Token expired' || e?.name === 'CliError') {
      throw e;
    }
    console.log(chalk.yellow('Failed to check wallet balance, continuing...'));
    return true;
  }
}

export default async function bindCmd(): Promise<void> {
  try {
    let { domain, targetPath, dns } = parseArgs();

    // Check auth
    const authConfig = getAuthConfig();
    if (!authConfig) {
      console.log(chalk.red('Please login first. Run: pinme set-appkey <AppKey>'));
      return;
    }

    if (!targetPath) {
      const ans = await inquirer.prompt([
        { type: 'input', name: 'path', message: 'Enter the path to upload and bind: ' },
      ]);
      targetPath = ans.path;
    }
    if (!domain) {
      const ans = await inquirer.prompt([
        { type: 'input', name: 'domain', message: 'Enter the domain to bind (e.g., my-site or example.com): ' },
      ]);
      domain = ans.domain?.trim();
    }
    if (!targetPath || !domain) {
      console.log(chalk.red('Missing parameters. Path and domain are required.'));
      return;
    }

    // Auto-detect domain type if not explicitly specified
    const isDns = dns || isDnsDomain(domain);
    const displayDomain = normalizeDomain(domain);

    // Validate DNS domain format
    if (isDns) {
      const validation = validateDnsDomain(domain);
      if (!validation.valid) {
        console.log(chalk.red(validation.message!));
        return;
      }
    }

    // Domain binding now uses wallet balance instead of VIP.
    try {
      const hasWalletBalance = await checkWalletBalanceStatus(authConfig);
      if (!hasWalletBalance) {
        console.log(chalk.red('Insufficient wallet balance. Please recharge your wallet first.'));
        console.log(chalk.cyan(`Recharge URL: ${getWalletRechargeUrl()}`));
        return;
      }
    } catch (e: any) {
      if (e.message === 'Token expired') {
        return; // Token expired hint already shown in API
      }
      throw e;
    }

    // Pre-check domain availability
    try {
      const check = await checkDomainAvailable(displayDomain);
      if (!check.is_valid) {
        console.log(chalk.red(`Domain not available: ${check.error || 'unknown reason'}`));
        return;
      }
      console.log(chalk.green(`Domain available: ${displayDomain}`));
    } catch (e: any) {
      if (e.message === 'Token expired') {
        return; // Token expired hint already shown in API
      }
      throw e;
    }

    // Upload
    const absolutePath = path.resolve(targetPath);
    console.log(chalk.blue(`Uploading: ${absolutePath}`));
    const up = await uploadPath(absolutePath, { uid: authConfig.address });
    if (!up?.contentHash) {
      console.log(chalk.red('Upload failed, binding aborted.'));
      return;
    }
    console.log(chalk.green(`Upload success, CID: ${up.contentHash}`));

    // Bind domain
    try {
      if (isDns) {
        // DNS domain binding
        console.log(chalk.blue('Binding DNS domain...'));
        const dnsResult = await bindDnsDomainV4(displayDomain, up.contentHash, authConfig.address, authConfig.token);
        if (dnsResult.code !== 200) {
          console.log(chalk.red(`DNS binding failed: ${dnsResult.msg}`));
          return;
        }
        console.log(chalk.green(`DNS bind success: ${displayDomain}`));
        console.log(chalk.white(`Visit: https://${displayDomain}`));
        console.log(chalk.cyan('\n📚 DNS Setup Guide: https://pinme.eth.limo/#/docs?id=custom-domain'));
      } else {
        // Pinme subdomain binding
        console.log(chalk.blue('Binding Pinme subdomain...'));
        const ok = await bindPinmeDomain(displayDomain, up.contentHash);
        if (!ok) {
          console.log(chalk.red('Binding failed. Please try again later.'));
          return;
        }
        console.log(chalk.green(`Bind success: ${displayDomain}`));
        const rootDomain = await getRootDomain();
        console.log(chalk.white(`Visit: https://${displayDomain}.${rootDomain}`));
      }
    } catch (e: any) {
      if (e.message === 'Token expired') {
        return; // Token expired hint already shown in API
      }
      throw e;
    }
  } catch (e: any) {
    printCliError(e, 'Bind failed.');
  }
}
