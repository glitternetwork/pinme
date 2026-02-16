import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import upload from './utils/uploadToIpfsSplit';
import { checkDomainAvailable, bindPinmeDomain, bindDnsDomainV4, isVip } from './utils/pinmeApi';
import { getAuthConfig } from './utils/auth';

interface Args {
  domain?: string;
  targetPath?: string;
  dns?: boolean;
}

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
    console.log(isDns,'isDns')
    const displayDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Validate DNS domain format
    if (isDns) {
      const validation = validateDnsDomain(domain);
      if (!validation.valid) {
        console.log(chalk.red(validation.message!));
        return;
      }
    }

    // All domain binding requires VIP
    try {
      const isVipUser = await checkVipStatus(authConfig);
      if (!isVipUser) {
        console.log(chalk.red('Domain binding requires VIP. Please upgrade to VIP first.'));
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
    const up = await upload(absolutePath);
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
        console.log(chalk.white(`Visit: https://${displayDomain}.pinit.eth.limo`));
      }
    } catch (e: any) {
      if (e.message === 'Token expired') {
        return; // Token expired hint already shown in API
      }
      throw e;
    }
  } catch (e: any) {
    console.log(chalk.red(`Execution failed: ${e?.message || e}`));
  }
}
