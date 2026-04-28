import chalk from 'chalk';
import { getWalletRechargeUrl } from './config';

interface CliErrorOptions {
  summary: string;
  stage?: string;
  details?: string[];
  suggestions?: string[];
  cause?: unknown;
}

export class CliError extends Error {
  stage?: string;
  details: string[];
  suggestions: string[];
  cause?: unknown;

  constructor(options: CliErrorOptions) {
    super(options.summary);
    this.name = 'CliError';
    this.stage = options.stage;
    this.details = options.details || [];
    this.suggestions = options.suggestions || [];
    this.cause = options.cause;
  }
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function getApiMessage(data: any): string | undefined {
  if (typeof data === 'string') {
    return data;
  }

  return data?.msg
    || data?.message
    || data?.data?.msg
    || data?.data?.message
    || data?.data?.error
    || data?.errors?.[0]?.message
    || data?.error;
}

function getApiDetailMessage(data: any): string | undefined {
  if (typeof data === 'string') {
    return data;
  }

  return data?.data?.error
    || data?.data?.msg
    || data?.data?.message
    || data?.errors?.[0]?.message
    || data?.error;
}

function getBusinessCode(data: any): string | undefined {
  if (data?.code === undefined || data?.code === null) {
    return undefined;
  }

  return String(data.code);
}

function getBusinessMessage(data: any): string | undefined {
  if (!data?.msg) {
    return undefined;
  }

  return String(data.msg);
}

function dedupeSuggestions(suggestions: string[]): string[] {
  return Array.from(new Set(suggestions.filter(Boolean)));
}

function getRechargeUrl(detail: string): string | null {
  const prefix = 'Recharge URL: ';
  if (!detail.startsWith(prefix)) {
    return null;
  }

  return detail.slice(prefix.length).trim() || null;
}

export function printRechargeUrl(url: string, useErrorStream: boolean = false): void {
  const output = useErrorStream ? console.error : console.log;
  output('');
  output(chalk.yellowBright.bold('Recharge URL:'));
  output(chalk.blueBright.bold.underline(url));
}

function isInsufficientBalanceError(
  businessCode: string | undefined,
  ...messages: Array<string | undefined>
): boolean {
  if (businessCode === '40001') {
    return true;
  }

  const combined = messages
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return combined.includes('insufficient balance')
    || combined.includes('insufficient wallet balance');
}

export function createConfigError(summary: string, suggestions: string[] = []): CliError {
  return new CliError({
    summary,
    stage: 'configuration',
    suggestions,
  });
}

export function createCommandError(stage: string, command: string, error: any, suggestions: string[] = []): CliError {
  const exitCode = error?.status ?? error?.code;
  const signal = error?.signal;
  const detailLines = [`Command: ${command}`];

  if (exitCode !== undefined) {
    detailLines.push(`Exit code: ${exitCode}`);
  }

  if (signal) {
    detailLines.push(`Signal: ${signal}`);
  }

  if (error?.message) {
    detailLines.push(`Reason: ${error.message}`);
  }

  return new CliError({
    summary: `${stage} failed.`,
    stage,
    details: detailLines,
    suggestions,
    cause: error,
  });
}

export function createApiError(stage: string, error: any, context: string[] = [], suggestions: string[] = []): CliError {
  const status = error?.response?.status;
  const responseData = error?.response?.data;
  const errorCode = error?.code;
  const rawMessage = error?.message;
  const apiMessage = getApiMessage(responseData);
  const apiDetailMessage = getApiDetailMessage(responseData);
  const businessCode = getBusinessCode(responseData);
  const businessMessage = getBusinessMessage(responseData);
  const hasInsufficientBalanceError = isInsufficientBalanceError(
    businessCode,
    apiMessage,
    apiDetailMessage,
    businessMessage,
    rawMessage,
  );
  const summary = apiMessage
    || businessMessage
    || apiDetailMessage
    || rawMessage
    || `${stage} failed.`;
  const detailLines = [...context];
  const hasBusinessError = Boolean(businessCode);

  if (businessCode) {
    detailLines.push(`Business code: ${businessCode}`);
  }

  if (status && !hasBusinessError) {
    detailLines.push(`HTTP status: ${status}`);
  }

  if (businessMessage && businessMessage !== summary) {
    detailLines.push(`Business message: ${businessMessage}`);
  }

  if (apiDetailMessage && apiDetailMessage !== summary && apiDetailMessage !== businessMessage) {
    detailLines.push(`Error detail: ${apiDetailMessage}`);
  }

  if (apiMessage && apiMessage !== summary && apiMessage !== apiDetailMessage) {
    detailLines.push(`Error message: ${apiMessage}`);
  }

  if (hasInsufficientBalanceError) {
    detailLines.push(`Recharge URL: ${getWalletRechargeUrl()}`);
  }

  if (errorCode && errorCode !== 'ERR_BAD_REQUEST' && !responseData) {
    detailLines.push(`Error code: ${errorCode}`);
  }

  const isGenericAxiosStatusMessage = typeof rawMessage === 'string'
    && /^Request failed with status code \d{3}$/.test(rawMessage);

  if (rawMessage && rawMessage !== summary && !(responseData && isGenericAxiosStatusMessage)) {
    detailLines.push(`Reason: ${rawMessage}`);
  }

  return new CliError({
    summary,
    stage,
    details: detailLines,
    suggestions: dedupeSuggestions(suggestions),
    cause: error,
  });
}

export function normalizeCliError(error: unknown, fallbackSummary: string, suggestions: string[] = []): CliError {
  if (error instanceof CliError) {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const maybeApiError = error as Record<string, any>;
    if (maybeApiError.response || maybeApiError.config) {
      return createApiError('API request', maybeApiError, [], suggestions);
    }
  }

  if (error instanceof Error) {
    return new CliError({
      summary: error.message || fallbackSummary,
      suggestions: dedupeSuggestions(suggestions),
      cause: error,
    });
  }

  return new CliError({
    summary: fallbackSummary,
    details: [`Raw error: ${stringifyValue(error)}`],
    suggestions: dedupeSuggestions(suggestions),
    cause: error,
  });
}

export function printCliError(error: unknown, fallbackSummary: string): void {
  const cliError = normalizeCliError(error, fallbackSummary);
  console.error(chalk.red(`\nError: ${cliError.message}`));

  if (cliError.stage) {
    console.error(chalk.gray(`Stage: ${cliError.stage}`));
  }

  for (const detail of cliError.details) {
    const rechargeUrl = getRechargeUrl(detail);
    if (rechargeUrl) {
      printRechargeUrl(rechargeUrl, true);
      continue;
    }
    console.error(chalk.gray(detail));
  }

  if (cliError.suggestions.length > 0) {
    console.error(chalk.yellow('\nNext steps:'));
    for (const suggestion of cliError.suggestions) {
      console.error(chalk.yellow(`- ${suggestion}`));
    }
  }
}
