// Mock for chalk
const chalk = {
  red: (str: string) => `\x1b[31m${str}\x1b[0m`,
  green: (str: string) => `\x1b[32m${str}\x1b[0m`,
  yellow: (str: string) => `\x1b[33m${str}\x1b[0m`,
  blue: (str: string) => `\x1b[34m${str}\x1b[0m`,
  cyan: (str: string) => `\x1b[36m${str}\x1b[0m`,
  gray: (str: string) => `\x1b[90m${str}\x1b[0m`,
  bold: (str: string) => `\x1b[1m${str}\x1b[0m`,
};

export default chalk;
export const red = chalk.red;
export const green = chalk.green;
export const yellow = chalk.yellow;
export const blue = chalk.blue;
export const cyan = chalk.cyan;
export const gray = chalk.gray;
export const bold = chalk.bold;
