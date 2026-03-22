import chalk from 'chalk';

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
  return data?.data?.error
    || data?.errors?.[0]?.message
    || data?.message
    || data?.msg
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
  const apiMessage = getApiMessage(responseData);
  const businessCode = getBusinessCode(responseData);
  const businessMessage = getBusinessMessage(responseData);
  const summary = apiMessage
    || error?.message
    || `${stage} failed.`;
  const detailLines = [...context];

  if (status) {
    detailLines.push(`HTTP status: ${status}`);
  }

  if (businessCode) {
    detailLines.push(`Business code: ${businessCode}`);
  }

  if (businessMessage && businessMessage !== apiMessage) {
    detailLines.push(`Business message: ${businessMessage}`);
  }

  if (apiMessage && apiMessage !== summary) {
    detailLines.push(`Error message: ${apiMessage}`);
  }

  if (errorCode && errorCode !== 'ERR_BAD_REQUEST' && !responseData) {
    detailLines.push(`Error code: ${errorCode}`);
  }

  if (!responseData && error?.message && error.message !== apiMessage) {
    detailLines.push(`Reason: ${error.message}`);
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
    console.error(chalk.gray(detail));
  }

  if (cliError.suggestions.length > 0) {
    console.error(chalk.yellow('\nNext steps:'));
    for (const suggestion of cliError.suggestions) {
      console.error(chalk.yellow(`- ${suggestion}`));
    }
  }
}
