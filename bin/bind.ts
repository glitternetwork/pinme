import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import upload from './utils/uploadToIpfsSplit';
import { checkDomainAvailable, bindPinmeDomain } from './utils/pinmeApi';

interface Args {
  domain?: string;
  targetPath?: string;
}

function parseArgs(): Args {
  // Usage: pinme bind <path> --domain <name>
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
  return res;
}

export default async function bindCmd(): Promise<void> {
  try {
    let { domain, targetPath } = parseArgs();
    if (!targetPath) {
      const ans = await inquirer.prompt([
        { type: 'input', name: 'path', message: 'Enter the path to upload and bind: ' },
      ]);
      targetPath = ans.path;
    }
    if (!domain) {
      const ans = await inquirer.prompt([
        { type: 'input', name: 'domain', message: 'Enter the Pinme subdomain (e.g., test_abc): ' },
      ]);
      domain = ans.domain?.trim();
    }
    if (!targetPath || !domain) {
      console.log(chalk.red('Missing parameters. Path and domain are required.'));
      return;
    }

    // 前置校验域名
    const check = await checkDomainAvailable(domain);
    if (!check.is_valid) {
      console.log(chalk.red(`Domain not available: ${check.error || 'unknown reason'}`));
      return;
    }
    console.log(chalk.green(`Domain available: ${domain}`));

    // 上传
    const absolutePath = path.resolve(targetPath);
    console.log(chalk.blue(`Uploading: ${absolutePath}`));
    const up = await upload(absolutePath);
    if (!up?.contentHash) {
      console.log(chalk.red('Upload failed, binding aborted.'));
      return;
    }
    console.log(chalk.green(`Upload success, CID: ${up.contentHash}`));

    // 绑定
    const ok = await bindPinmeDomain(domain, up.contentHash);
    if (!ok) {
      console.log(chalk.red('Binding failed. Please try again later.'));
      return;
    }
    console.log(chalk.green(`Bind success: ${domain}`));
    console.log(chalk.white(`Visit (Pinme subdomain example): https://${domain}.pinit.eth.limo`));
  } catch (e: any) {
    console.log(chalk.red(`Execution failed: ${e?.message || e}`));
  }
}


