import chalk from 'chalk';
import dayjs from 'dayjs';
import { getMyDomains } from './utils/pinmeApi';

export default async function myDomainsCmd(): Promise<void> {
  try {
    const list = await getMyDomains();
    if (!list.length) {
      console.log(chalk.yellow('No bound domains found.'));
      return;
    }

    console.log(chalk.cyan('My domains:'));
    console.log(chalk.cyan('-'.repeat(80)));
    list.forEach((item, i) => {
      console.log(chalk.green(`${i + 1}. ${item.domain_name}`));
      console.log(chalk.white(`   Type: ${item.domain_type}`));
      if (item.bind_time) {
        console.log(chalk.white(`   Bind time: ${dayjs(item.bind_time * 1000).format('YYYY-MM-DD HH:mm:ss')}`));
      }
      if (typeof item.expire_time === 'number') {
        const label = item.expire_time === 0 ? 'Never' : dayjs(item.expire_time * 1000).format('YYYY-MM-DD HH:mm:ss');
        console.log(chalk.white(`   Expire time: ${label}`));
      }
      console.log(chalk.cyan('-'.repeat(80)));
    });
  } catch (e: any) {
    console.log(chalk.red(`Failed to fetch domains: ${e?.message || e}`));
  }
}


