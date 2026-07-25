import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { test } from 'vitest';

async function loadHelper() {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'pinme-tracker-helper-'));
  const outfile = path.join(tempDir, 'tracker.cjs');

  await build({
    entryPoints: [path.resolve('bin/utils/tracker.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
  });

  const helper = await import(pathToFileURL(outfile).href);
  return {
    helper,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

test('getTrackErrorReason normalizes HTML API responses', async () => {
  const { helper, cleanup } = await loadHelper();

  try {
    assert.equal(
      helper.getTrackErrorReason({
        response: {
          status: 502,
          data: '<!DOCTYPE html><html><body>Bad Gateway</body></html>',
        },
        message: 'Request failed with status code 502',
      }),
      'api_returned_html',
    );
  } finally {
    cleanup();
  }
});

test('getTrackErrorReason normalizes gateway status failures', async () => {
  const { helper, cleanup } = await loadHelper();

  try {
    assert.equal(
      helper.getTrackErrorReason(new Error('Request failed with status code 520')),
      'gateway_520',
    );
  } finally {
    cleanup();
  }
});

test('getTrackErrorReason prefers nested cause over command wrapper messages', async () => {
  const { helper, cleanup } = await loadHelper();

  try {
    const htmlError = {
      response: {
        status: 520,
        data: '<html>edge error</html>',
      },
      message: 'Request failed with status code 520',
    };
    const wrappedError = new Error('frontend deploy failed.');
    wrappedError.cause = htmlError;

    assert.equal(
      helper.getTrackErrorReason(wrappedError),
      'api_returned_html',
    );
  } finally {
    cleanup();
  }
});

test('getTrackErrorReason normalizes authentication failures', async () => {
  const { helper, cleanup } = await loadHelper();

  try {
    assert.equal(
      helper.getTrackErrorReason(new Error('Token authentication failed')),
      'token_auth_failed',
    );
  } finally {
    cleanup();
  }
});

test('buildTrackPayload only emits backend accepted fields and serializes extra data into re', async () => {
  const { helper, cleanup } = await loadHelper();

  try {
    const payload = helper.buildTrackPayload('upload_failed', 'cli_upload', {
      a: 'fail',
      reason: 'network_error',
      path_kind: 'file',
      has_domain: false,
      project_name: 'demo-project',
      cli_version: '2.0.11',
    });

    assert.deepEqual(Object.keys(payload).sort(), ['a', 'ev', 'p', 'pd', 're', 's']);
    assert.equal(payload.pd, 'pinme-cli');
    assert.equal(payload.p, 'cli_upload');
    assert.equal(payload.ev, 'upload');
    assert.equal(payload.a, 'fail');
    assert.equal(payload.s, 'cli');
    assert.equal(typeof payload.re, 'string');

    const re = JSON.parse(payload.re);
    assert.deepEqual(re, {
      reason: 'network_error',
      path_kind: 'file',
      has_domain: false,
      project_name: 'demo-project',
      cli_version: '2.0.11',
    });
  } finally {
    cleanup();
  }
});

test('buildTrackPayload keeps serialized re valid JSON within 255 chars', async () => {
  const { helper, cleanup } = await loadHelper();

  try {
    const payload = helper.buildTrackPayload('upload_failed', 'cli_upload', {
      reason: 'x'.repeat(500),
      path_kind: 'file',
      has_domain: false,
      project_name: 'demo-project',
    });

    assert.ok(payload.re.length <= 255);
    const re = JSON.parse(payload.re);
    assert.equal(re.path_kind, 'file');
    assert.equal(re.has_domain, false);
    assert.equal(re.project_name, 'demo-project');
    assert.ok(re.reason.length < 500);
  } finally {
    cleanup();
  }
});
