import {
  CliError,
  createConfigError,
  createCommandError,
  createApiError,
  normalizeCliError,
  printCliError,
} from './cliError';

// ==================== Positive Test Cases ====================

describe('CliError', () => {
  it('should create error with all options', () => {
    const error = new CliError({
      summary: 'Test error',
      stage: 'test-stage',
      details: ['detail1', 'detail2'],
      suggestions: ['suggestion1'],
      cause: new Error('Original error'),
    });

    expect(error.message).toBe('Test error');
    expect(error.name).toBe('CliError');
    expect(error.stage).toBe('test-stage');
    expect(error.details).toEqual(['detail1', 'detail2']);
    expect(error.suggestions).toEqual(['suggestion1']);
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('should create error with minimal options', () => {
    const error = new CliError({
      summary: 'Minimal error',
    });

    expect(error.message).toBe('Minimal error');
    expect(error.stage).toBeUndefined();
    expect(error.details).toEqual([]);
    expect(error.suggestions).toEqual([]);
    expect(error.cause).toBeUndefined();
  });
});

describe('createConfigError', () => {
  it('should create config error with suggestions', () => {
    const error = createConfigError(
      'Invalid configuration',
      ['Check your pinme.toml file', 'Verify the path exists']
    );

    expect(error.message).toBe('Invalid configuration');
    expect(error.stage).toBe('configuration');
    expect(error.suggestions).toEqual([
      'Check your pinme.toml file',
      'Verify the path exists',
    ]);
  });

  it('should create config error without suggestions', () => {
    const error = createConfigError('Missing config');

    expect(error.message).toBe('Missing config');
    expect(error.stage).toBe('configuration');
    expect(error.suggestions).toEqual([]);
  });
});

describe('createCommandError', () => {
  it('should create command error with all details', () => {
    const originalError = {
      message: 'Command failed',
      status: 1,
      signal: 'SIGTERM',
    };

    const error = createCommandError('build', 'npm run build', originalError);

    expect(error.message).toBe('build failed.');
    expect(error.stage).toBe('build');
    expect(error.details).toContain('Command: npm run build');
    expect(error.details).toContain('Exit code: 1');
    expect(error.details).toContain('Signal: SIGTERM');
    expect(error.details).toContain('Reason: Command failed');
    expect(error.cause).toBe(originalError);
  });

  it('should create command error without exit code', () => {
    const originalError = {
      message: 'Process error',
    };

    const error = createCommandError('deploy', 'deploy.sh', originalError);

    expect(error.message).toBe('deploy failed.');
    expect(error.details).toContain('Command: deploy.sh');
    expect(error.details).toContain('Reason: Process error');
    expect(error.details).not.toContain('Exit code:');
  });

  it('should create command error with custom suggestions', () => {
    const originalError = { message: 'Error' };
    const suggestions = ['Try running with verbose flag'];

    const error = createCommandError(
      'upload',
      'upload.cmd',
      originalError,
      suggestions
    );

    expect(error.suggestions).toEqual(suggestions);
  });
});

describe('createApiError', () => {
  it('should handle error with data.error message', () => {
    const axiosError = {
      message: 'Request failed',
      response: {
        status: 400,
        data: {
          error: 'Validation failed',
        },
      },
    };

    const error = createApiError(
      'create',
      axiosError,
      [],
      ['Check input parameters']
    );

    expect(error.message).toBe('Validation failed');
    expect(error.stage).toBe('create');
    expect(error.details).toContain('HTTP status: 400');
    expect(error.suggestions).toContain('Check input parameters');
  });

  it('should handle error with errors array', () => {
    const axiosError = {
      response: {
        status: 400,
        data: {
          errors: [{ message: 'Field required' }],
        },
      },
    };

    const error = createApiError('update', axiosError);

    expect(error.message).toBe('Field required');
  });

  it('should handle error with business code', () => {
    const axiosError = {
      response: {
        status: 200,
        data: {
          code: 1001,
          msg: 'Business error occurred',
        },
      },
    };

    const error = createApiError('process', axiosError);

    expect(error.message).toBe('Business error occurred');
    expect(error.details).toContain('Business code: 1001');
  });

  it('should handle error with data.msg only', () => {
    const axiosError = {
      response: {
        data: {
          msg: 'Operation not allowed',
        },
      },
    };

    const error = createApiError('delete', axiosError);

    expect(error.message).toBe('Operation not allowed');
  });

  it('should use error.message when no api message', () => {
    const axiosError = {
      message: 'Network error',
      response: {},
    };

    const error = createApiError('fetch', axiosError);

    expect(error.message).toBe('Network error');
    expect(error.details).toContain('Reason: Network error');
  });

  it('should use fallback summary when no message available', () => {
    const axiosError = {
      response: {
        status: 500,
        data: null,
      },
    };

    const error = createApiError('api', axiosError);

    expect(error.message).toBe('api failed.');
  });

  it('should handle context parameter', () => {
    const axiosError = {
      response: {
        status: 400,
        data: { error: 'Bad request' },
      },
    };

    const context = ['Project: my-project', 'Environment: production'];
    const error = createApiError('deploy', axiosError, context);

    expect(error.details).toContain('Project: my-project');
    expect(error.details).toContain('Environment: production');
  });

  it('should handle error code without response data', () => {
    const axiosError = {
      code: 'ENOTFOUND',
      message: 'getaddrinfo ENOTFOUND api.example.com',
      response: undefined,
    };

    const error = createApiError('login', axiosError);

    expect(error.details).toContain('Error code: ENOTFOUND');
    expect(error.details).toContain('Reason: getaddrinfo ENOTFOUND api.example.com');
  });

  it('should not add error code when response data exists', () => {
    const axiosError = {
      code: 'ERR_BAD_REQUEST',
      response: {
        status: 400,
        data: { error: 'Bad request' },
      },
    };

    const error = createApiError('create', axiosError);

    expect(error.details).not.toContain('Error code:');
  });

  it('should dedupe suggestions', () => {
    const axiosError = {
      response: {
        data: { error: 'Error' },
      },
    };

    const error = createApiError('test', axiosError, [], [
      'same suggestion',
      'same suggestion',
      'different',
    ]);

    expect(error.suggestions).toEqual(['same suggestion', 'different']);
  });

  it('should set cause to the error object', () => {
    const axiosError = {
      message: 'Error',
      response: { data: { error: 'Test' } },
    };

    const error = createApiError('stage', axiosError);

    expect(error.cause).toBe(axiosError);
  });

  it('should handle data.data.error format', () => {
    const axiosError = {
      response: {
        data: {
          data: {
            error: 'Nested error message',
          },
        },
      },
    };

    const error = createApiError('process', axiosError);

    expect(error.message).toBe('Nested error message');
  });
});

describe('normalizeCliError', () => {
  it('should return CliError as is', () => {
    const originalError = new CliError({
      summary: 'Already a CliError',
    });

    const result = normalizeCliError(originalError, 'fallback');

    expect(result).toBe(originalError);
  });

  it('should convert Error to CliError', () => {
    const originalError = new Error('Original error message');

    const result = normalizeCliError(originalError, 'fallback');

    expect(result).toBeInstanceOf(CliError);
    expect(result.message).toBe('Original error message');
    expect(result.cause).toBe(originalError);
  });

  it('should convert string to CliError', () => {
    const result = normalizeCliError('String error', 'fallback');

    expect(result).toBeInstanceOf(CliError);
    expect(result.message).toBe('fallback');
    expect(result.details).toContain('Raw error: String error');
  });

  it('should convert object to CliError', () => {
    const obj = { code: 'ENOENT', path: '/test' };

    const result = normalizeCliError(obj, 'fallback');

    expect(result).toBeInstanceOf(CliError);
    expect(result.details).toContain(`Raw error: ${JSON.stringify(obj)}`);
  });

  it('should use fallback summary when error has no message', () => {
    const error = new Error('');
    const result = normalizeCliError(error, 'Fallback message');

    expect(result.message).toBe('Fallback message');
  });

  it('should add custom suggestions', () => {
    const error = new Error('Test');
    const suggestions = ['Suggestion 1', 'Suggestion 2'];

    const result = normalizeCliError(error, 'fallback', suggestions);

    expect(result.suggestions).toEqual(suggestions);
  });

  it('should dedupe suggestions', () => {
    const error = new Error('Test');

    const result = normalizeCliError(error, 'fallback', [
      'same',
      'same',
      'different',
    ]);

    expect(result.suggestions).toEqual(['same', 'different']);
  });

  it('should filter out empty suggestions', () => {
    const error = new Error('Test');

    const result = normalizeCliError(error, 'fallback', [
      'valid',
      '',
      null as any,
      undefined as any,
      'another valid',
    ]);

    expect(result.suggestions).toEqual(['valid', 'another valid']);
  });

  it('should handle null/undefined input', () => {
    const result1 = normalizeCliError(null as any, 'fallback');
    expect(result1.details).toContain('Raw error: ');

    const result2 = normalizeCliError(undefined as any, 'fallback');
    expect(result2.details).toContain('Raw error: ');
  });
});

describe('printCliError', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should print CliError correctly', () => {
    const error = new CliError({
      summary: 'Test error',
      stage: 'testing',
      details: ['Detail 1'],
      suggestions: ['Suggestion 1'],
    });

    printCliError(error, 'fallback');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error: Test error')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Stage: testing')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Detail 1')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Next steps:')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Suggestion 1')
    );
  });

  it('should normalize and print non-CliError', () => {
    printCliError('Simple error', 'fallback message');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error: fallback message')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Raw error: Simple error')
    );
  });

  it('should not print suggestions if none provided', () => {
    const error = new CliError({
      summary: 'Error without suggestions',
    });

    printCliError(error, 'fallback');

    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Next steps:')
    );
  });

  it('should print stage if available', () => {
    const error = new CliError({
      summary: 'Stage error',
      stage: 'upload',
    });

    printCliError(error, 'fallback');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Stage: upload')
    );
  });

  it('should print all details', () => {
    const error = new CliError({
      summary: 'Multi detail error',
      details: ['Detail A', 'Detail B', 'Detail C'],
    });

    printCliError(error, 'fallback');

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Detail A'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Detail B'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Detail C'));
  });

  it('should print multiple suggestions', () => {
    const error = new CliError({
      summary: 'Error',
      suggestions: ['Step 1', 'Step 2', 'Step 3'],
    });

    printCliError(error, 'fallback');

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Step 1'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Step 2'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Step 3'));
  });
});

// ==================== Negative Test Cases ====================

describe('CliError - Negative Cases', () => {
  it('should NOT add details when undefined is passed', () => {
    const error = new CliError({
      summary: 'Test',
      details: undefined as any,
    });

    expect(error.details).toEqual([]);
  });

  it('should NOT add suggestions when null is passed', () => {
    const error = new CliError({
      summary: 'Test',
      suggestions: null as any,
    });

    expect(error.suggestions).toEqual([]);
  });

  it('should have correct name', () => {
    const error = new CliError({ summary: 'Test' });
    expect(error.name).toBe('CliError');
  });
});

describe('createConfigError - Negative Cases', () => {
  it('should NOT have unexpected stage', () => {
    const error = createConfigError('Error');

    expect(error.stage).not.toBe('api');
    expect(error.stage).not.toBe('upload');
  });

  it('should NOT have undefined stage', () => {
    const error = createConfigError('Error');
    expect(error.stage).toBe('configuration');
  });
});

describe('createCommandError - Negative Cases', () => {
  it('should NOT include undefined exit code', () => {
    const originalError = { message: 'Error' };
    const error = createCommandError('build', 'cmd', originalError);

    expect(error.details).not.toContain('Exit code: undefined');
  });

  it('should NOT accept non-string command', () => {
    const error = createCommandError('test', null as any, {});

    expect(error.details).toContain('Command: null');
  });
});

describe('createApiError - Negative Cases', () => {
  it('should NOT include undefined HTTP status', () => {
    const axiosError = {
      response: {
        data: { error: 'Error' },
      },
    };

    const error = createApiError('test', axiosError);

    expect(error.details).not.toContain('HTTP status: undefined');
  });

  it('should NOT add duplicate business code', () => {
    const axiosError = {
      response: {
        data: {
          code: 1001,
          msg: 'error',
          error: 'error',
        },
      },
    };

    const error = createApiError('test', axiosError);

    const businessCodeCount = error.details.filter(d => d.includes('Business code:')).length;
    expect(businessCodeCount).toBe(1);
  });

  it('should NOT include error code when response data exists', () => {
    const axiosError = {
      code: 'ERR_BAD_REQUEST',
      response: {
        data: { error: 'Bad request' },
      },
    };

    const error = createApiError('test', axiosError);

    expect(error.details).not.toContain('Error code: ERR_BAD_REQUEST');
  });
});

describe('normalizeCliError - Negative Cases', () => {
  it('should NOT modify original CliError instance', () => {
    const original = new CliError({ summary: 'Original' });
    const result = normalizeCliError(original, 'Fallback');

    expect(result).toBe(original);
  });

  it('should NOT lose original error message', () => {
    const error = new Error('Original message');
    const result = normalizeCliError(error, 'Fallback');

    expect(result.message).toBe('Original message');
  });
});

describe('printCliError - Negative Cases', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should NOT print stage when not provided', () => {
    const error = new CliError({ summary: 'Error' });

    printCliError(error, 'fallback');

    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Stage:')
    );
  });

  it('should NOT print suggestions when empty', () => {
    const error = new CliError({ summary: 'Error', suggestions: [] });

    printCliError(error, 'fallback');

    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Next steps:')
    );
  });

  it('should handle non-object error without crashing', () => {
    expect(() => {
      printCliError(123, 'fallback');
    }).not.toThrow();
  });

  it('should handle circular reference without crashing', () => {
    const obj: any = { circular: null };
    obj.circular = obj;

    expect(() => {
      printCliError(obj, 'fallback');
    }).not.toThrow();
  });
});
