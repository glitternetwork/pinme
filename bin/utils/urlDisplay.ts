import chalk from 'chalk';

type UrlTone = 'primary' | 'management';

export function printHighlightedUrl(
  label: string,
  url: string,
  tone: UrlTone = 'primary',
): void {
  const safeLabel = label.trim() || 'URL';
  const safeUrl = url.trim();
  const labelStyle = chalk.black.bgWhiteBright.bold;
  const urlStyle =
    tone === 'management'
      ? chalk.blueBright.bold.underline
      : chalk.cyanBright.bold;

  console.log('');
  console.log(labelStyle(` ${safeLabel} `));
  console.log(urlStyle(safeUrl));
  console.log('');
}
