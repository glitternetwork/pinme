import chalk from 'chalk';
import inquirer from 'inquirer';
import figlet from 'figlet';
import { removeFromIpfs } from './utils/removeFromIpfs';

interface RemoveOptions {
  [key: string]: any;
}

// Validate IPFS hash format
function isValidIPFSHash(hash: string): boolean {
  // IPFS v0 hash (Qm...)
  const v0Pattern = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
  // IPFS v1 hash (bafy...)
  const v1Pattern = /^bafy[a-z2-7]{50,}$/;
  // IPFS v1 hash (bafk...)
  const v1kPattern = /^bafk[a-z2-7]{50,}$/;
  // IPFS v1 hash (bafybe...)
  const v1bePattern = /^bafybe[a-z2-7]{50,}$/;
  
  return v0Pattern.test(hash) || v1Pattern.test(hash) || v1kPattern.test(hash) || v1bePattern.test(hash);
}

// Validate subname format (simple alphanumeric combination)
function isValidSubname(subname: string): boolean {
  const subnamePattern = /^[a-zA-Z0-9]{6,12}$/;
  return subnamePattern.test(subname);
}

// Parse different input formats
function parseInput(input: string): { type: 'hash' | 'subname'; value: string } | null {
  const trimmedInput = input.trim();
  
  // Case 1: Full URL with hash - https://bafybeigthbkdv2ufll47r7e7f5z4c3vubyggxwotl52parmy3d3abt6ztu.pinme.dev
  const hashUrlPattern = /https?:\/\/([a-z0-9]{50,})\.pinme\.dev/i;
  const hashUrlMatch = trimmedInput.match(hashUrlPattern);
  if (hashUrlMatch) {
    const hash = hashUrlMatch[1];
    if (isValidIPFSHash(hash)) {
      return { type: 'hash', value: hash };
    }
  }
  
  // Case 2: Direct hash - bafybeigthbkdv2ufll47r7e7f5z4c3vubyggxwotl52parmy3d3abt6ztu
  if (isValidIPFSHash(trimmedInput)) {
    return { type: 'hash', value: trimmedInput };
  }
  
  // Case 3: Subname URL - https://3abt6ztu.pinit.eth.limo
  const subnameUrlPattern = /https?:\/\/([a-zA-Z0-9]{6,12})\.pinit\.eth\.limo/i;
  const subnameUrlMatch = trimmedInput.match(subnameUrlPattern);
  if (subnameUrlMatch) {
    const subname = subnameUrlMatch[1];
    if (isValidSubname(subname)) {
      return { type: 'subname', value: subname };
    }
  }
  
  // Case 4: Direct subname - 3abt6ztu
  if (isValidSubname(trimmedInput)) {
    return { type: 'subname', value: trimmedInput };
  }
  
  return null;
}

export default async (options?: RemoveOptions): Promise<void> => {
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

    // If parameter is passed, remove directly, e.g.: pinme rm <hash>
    const argHash = process.argv[3];

    if (argHash && !argHash.startsWith('-')) {
      const parsedInput = parseInput(argHash);
      
      if (!parsedInput) {
        console.log(chalk.red(`Invalid input format: ${argHash}`));
        console.log(chalk.yellow('Supported formats:'));
        console.log(chalk.yellow('  - IPFS hash: bafybeig...'));
        console.log(chalk.yellow('  - Full URL: https://bafybeig....pinme.dev'));
        console.log(chalk.yellow('  - Subname: 3abt6ztu'));
        console.log(chalk.yellow('  - Subname URL: https://3abt6ztu.pinit.eth.limo'));
        return;
      }

      try {
        const success = await removeFromIpfs(parsedInput.value, parsedInput.type);
        if (success) {
          console.log(
            chalk.cyan(
              figlet.textSync('Successful', { horizontalLayout: 'full' }),
            ),
          );
        }
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      return;
    }

    // Interactive removal
    console.log(chalk.yellow('⚠️  Warning: This action will permanently remove the content from IPFS network'));
    console.log(chalk.yellow('⚠️  Make sure you have the correct IPFS hash'));
    console.log('');

    const confirmAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to continue?',
        default: false,
      },
    ]);

    if (!confirmAnswer.confirm) {
      console.log(chalk.yellow('Operation cancelled'));
      return;
    }

    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'input',
        message: 'Enter IPFS hash, subname, or URL to remove:',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Please enter an IPFS hash, subname, or URL';
          }
          const parsedInput = parseInput(input.trim());
          if (!parsedInput) {
            return 'Invalid format. Supported: IPFS hash, full URL (*.pinme.dev), subname, or subname URL (*.pinit.eth.limo)';
          }
          return true;
        },
      },
    ]);

    if (answer.input) {
      const parsedInput = parseInput(answer.input.trim());
      
      if (!parsedInput) {
        console.log(chalk.red('Invalid input format'));
        return;
      }
      
      // Final confirmation
      const finalConfirm = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to remove ${parsedInput.type === 'hash' ? 'hash' : 'subname'}: ${parsedInput.value}?`,
          default: false,
        },
      ]);

      if (!finalConfirm.confirm) {
        console.log(chalk.yellow('Operation cancelled'));
        return;
      }

      try {
        const success = await removeFromIpfs(parsedInput.value, parsedInput.type);
        if (success) {
          console.log(
            chalk.cyan(
              figlet.textSync('Successful', { horizontalLayout: 'full' }),
            ),
          );
        }
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
    }
  } catch (error: any) {
    console.error(chalk.red(`Error executing remove command: ${error.message}`));
    console.error(error.stack);
  }
}; 