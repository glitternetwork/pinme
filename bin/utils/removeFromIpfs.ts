import axios from 'axios';
import chalk from 'chalk';
import { getUid } from './getDeviceId';

// Get API base URL from environment variables
const ipfsApiUrl =
  process.env.IPFS_API_URL || 'https://ipfs.glitterprotocol.dev/api/v2';

interface RemoveResponse {
  code: number;
  msg: string;
  data: any;
}

/**
 * Remove file from IPFS network
 * @param value - IPFS content hash or subname
 * @param type - Type of the value: 'hash' or 'subname'
 * @returns Promise<boolean> - Whether deletion was successful
 */
export async function removeFromIpfs(
  value: string,
  type: 'hash' | 'subname' = 'hash',
): Promise<boolean> {
  try {
    const uid = getUid();

    console.log(chalk.blue(`Removing content from IPFS: ${value}...`));

    // Build query parameters based on type
    const queryParams = new URLSearchParams({
      uid: uid,
    });

    if (type === 'subname') {
      queryParams.append('subname', value);
    } else {
      queryParams.append('arg', value);
    }

    const response = await axios.post<RemoveResponse>(
      `${ipfsApiUrl}/block/rm?${queryParams.toString()}`,
      {
        timeout: 30000, // 30 seconds timeout
      },
    );

    const { code, msg, data } = response.data;

    if (code === 200) {
      console.log(chalk.green('✓ Removal successful!'));
      console.log(
        chalk.cyan(
          `Content ${type}: ${value} has been removed from IPFS network`,
        ),
      );
      return true;
    } else {
      console.log(chalk.red('✗ Removal failed'));
      console.log(chalk.red(`Error: ${msg || 'Unknown error occurred'}`));
      return false;
    }
  } catch (error: any) {
    console.log(chalk.red('✗ Removal failed', error));

    if (error.response) {
      // Server responded with error status code
      const { status, data } = error.response;
      console.log(
        chalk.red(`HTTP Error ${status}: ${data?.msg || 'Server error'}`),
      );

      if (status === 404) {
        console.log(
          chalk.yellow('Content not found on the network or already removed'),
        );
      } else if (status === 403) {
        console.log(
          chalk.yellow(
            'Permission denied - you may not have access to remove this content',
          ),
        );
      } else if (status === 500) {
        console.log(
          chalk.yellow('Server internal error - please try again later'),
        );
      }
    } else if (error.request) {
      // Request was made but no response received
      console.log(
        chalk.red('Network error: Unable to connect to IPFS service'),
      );
      console.log(
        chalk.yellow('Please check your internet connection and try again'),
      );
    } else {
      // Other errors
      console.log(chalk.red(`Error: ${error.message}`));
    }

    return false;
  }
}

export default removeFromIpfs;
