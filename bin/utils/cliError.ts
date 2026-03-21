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
  return data?.errors?.[0]?.message
    || data?.message
    || data?.msg
    || data?.error;
}

function dedupeSuggestions(suggestions: string[]): string[] {
  return Array.from(new Set(suggestions.filter(Boolean)));
}

function inferApiSummary(stage: string, status: number | undefined, errorCode: string | undefined, apiMessage: string | undefined, rawResponse: string): string {
  const text = `${apiMessage || ''} ${rawResponse}`.toLowerCase();

  if (status === 401 || status === 403) {
    return 'Authentication expired or permission denied.';
  }

  if (status === 404) {
    return 'Project or API endpoint was not found.';
  }

  if (errorCode === 'ECONNABORTED' || text.includes('timeout')) {
    return 'Request timed out while talking to the platform.';
  }

  if (errorCode === 'ENOTFOUND' || errorCode === 'ECONNREFUSED' || errorCode === 'ECONNRESET') {
    return 'Unable to connect to the platform API.';
  }

  if (text.includes('sql') || text.includes('sqlite') || text.includes('migration')) {
    return 'Database migration failed.';
  }

  if (text.includes('not found') && text.includes('project')) {
    return 'Project was not found on the platform.';
  }

  if (text.includes('already exists') || text.includes('duplicate')) {
    return 'The platform rejected the request because of conflicting existing data.';
  }

  if (status && status >= 500) {
    return 'The platform returned a server-side error.';
  }

  return apiMessage || `${stage} failed.`;
}

function inferApiSuggestions(status: number | undefined, errorCode: string | undefined, apiMessage: string | undefined, rawResponse: string): string[] {
  const text = `${apiMessage || ''} ${rawResponse}`.toLowerCase();
  const suggestions: string[] = [];

  if (status === 401 || status === 403) {
    suggestions.push('Run `pinme login` again to refresh local auth.');
  }

  if (status === 404 || (text.includes('project') && text.includes('not found'))) {
    suggestions.push('Confirm `project_name` in `pinme.toml` matches an existing project.');
  }

  if (errorCode === 'ECONNABORTED' || text.includes('timeout')) {
    suggestions.push('Retry once. If it keeps timing out, check network quality and platform responsiveness.');
  }

  if (errorCode === 'ENOTFOUND' || errorCode === 'ECONNREFUSED' || errorCode === 'ECONNRESET') {
    suggestions.push('Check `PINME_API_BASE`, local network connectivity, and whether the API service is reachable.');
  }

  if (text.includes('sql') || text.includes('sqlite') || text.includes('migration')) {
    suggestions.push('Review the SQL file mentioned in the response and verify it is safe to run on the current schema.');
  }

  if (text.includes('already exists') || text.includes('duplicate')) {
    suggestions.push('Check whether this resource or schema change was already created in a previous deployment.');
  }

  if (status && status >= 500) {
    suggestions.push('The platform returned a server-side error. Retry once and check the backend logs if it persists.');
  }

  return suggestions;
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
  const detailLines = [...context];

  if (status) {
    detailLines.push(`HTTP status: ${status}`);
  }

  if (apiMessage && apiMessage !== summary) {
    detailLines.push(`API message: ${apiMessage}`);
  }

  const rawResponse = stringifyValue(responseData);
  if (rawResponse) {
    detailLines.push(`API response: ${rawResponse}`);
  }

  if (errorCode && errorCode !== 'ERR_BAD_REQUEST') {
    detailLines.push(`Error code: ${errorCode}`);
  }

  if (!rawResponse && error?.message && error.message !== apiMessage) {
    detailLines.push(`Reason: ${error.message}`);
  }

  const inferredSuggestions = inferApiSuggestions(status, errorCode, apiMessage, rawResponse);
  const summary = inferApiSummary(stage, status, errorCode, apiMessage, rawResponse)
    || error?.message
    || `${stage} failed.`;

  return new CliError({
    summary,
    stage,
    details: detailLines,
    suggestions: dedupeSuggestions([...inferredSuggestions, ...suggestions]),
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
