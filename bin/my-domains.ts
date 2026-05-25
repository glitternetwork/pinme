import chalk from 'chalk';
import dayjs from 'dayjs';
import { printCliError } from './utils/cliError';
import { getMyDomains } from './utils/pinmeApi';
import tracker, { getTrackErrorReason } from './utils/tracker';
import {
  TRACK_EVENTS,
  TRACK_PAGES,
  resolveTrackAction,
} from './utils/trackerEvents';

export default async function myDomainsCmd(): Promise<void> {
  try {
    const list = await getMyDomains();
    void tracker.trackEvent(TRACK_EVENTS.myDomainsSuccess, TRACK_PAGES.domain, {
      a: resolveTrackAction(TRACK_EVENTS.myDomainsSuccess),
      domain_count: list.length,
    });
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
    void tracker.trackEvent(TRACK_EVENTS.myDomainsFailed, TRACK_PAGES.domain, {
      a: resolveTrackAction(TRACK_EVENTS.myDomainsFailed),
      reason: getTrackErrorReason(e),
    });
    printCliError(e, 'Failed to fetch domains.');
  }
}
