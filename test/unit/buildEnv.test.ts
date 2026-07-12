import { describe, expect, test } from 'vitest';

type DefineMap = Record<string, string | undefined>;

const { createDefineMap } = require('../../build-env') as {
  createDefineMap: (env: Record<string, string | undefined>) => DefineMap;
};

describe('build env defines', () => {
  test('filters env keys that are not valid define identifiers', () => {
    const define = createDefineMap({
      PINME_API_BASE: 'https://pinme.dev/api/v4',
      'npm_package_bin_pinme-agent': './dist/index.js',
      SECRET_KEY: 'dummy',
    });

    expect(define['process.env.PINME_API_BASE']).toBe(
      JSON.stringify('https://pinme.dev/api/v4'),
    );
    expect(define['process.env.SECRET_KEY']).toBe(JSON.stringify('dummy'));
    expect(define['process.env.npm_package_bin_pinme-agent']).toBeUndefined();
  });
});
