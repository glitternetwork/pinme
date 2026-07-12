import path from 'path';
import { chmod, mkdir, readFile, writeFile } from 'fs/promises';
import { setTimeout as delay } from 'timers/promises';
import AdmZip from 'adm-zip';
import { describe, expect, test } from 'vitest';
import {
  buildCliWithEnv,
  createTempHome,
  repoRoot,
  runCli,
  writeAuthConfig,
} from '../helpers/cliRunner';
import { startLocalHttpServer } from '../helpers/localHttpServer';

function outputOf(result: { stdout: string; stderr: string }): string {
  return `${result.stdout}\n${result.stderr}`;
}

function createTemplateZipBuffer(): Buffer {
  const zip = new AdmZip();
  const root = 'pinme-worker-template-main';

  zip.addFile(
    `${root}/package.json`,
    Buffer.from('{"scripts":{"build":"echo build"}}\n'),
  );
  zip.addFile(
    `${root}/pinme.toml`,
    Buffer.from('project_name = "template-project"\n'),
  );
  zip.addFile(
    `${root}/backend/wrangler.toml`,
    Buffer.from('name = "template-project"\n'),
  );
  zip.addFile(
    `${root}/dist-worker/worker.js`,
    Buffer.from('export default { fetch() { return new Response("ok"); } };\n'),
  );
  zip.addFile(
    `${root}/db/001_init.sql`,
    Buffer.from('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY);\n'),
  );
  zip.addFile(
    `${root}/frontend/.env.example`,
    Buffer.from('VITE_API_URL=https://your-project.example\n'),
  );
  zip.addFile(
    `${root}/frontend/src/utils/config.ts`,
    Buffer.from('export const existing = true;\n'),
  );
  zip.addFile(
    `${root}/frontend/dist/index.html`,
    Buffer.from(
      '<script>window.API="__PINME_VITE_API_URL__";window.KEY="__PINME_AUTH_API_KEY__";</script>\n',
    ),
  );

  return zip.toBuffer();
}

async function createFakeNpmBin(root: string): Promise<string> {
  const binDir = path.join(root, 'fake-bin');
  const npmPath = path.join(binDir, 'npm');
  await mkdir(binDir, { recursive: true });
  await writeFile(npmPath, '#!/bin/sh\nexit 0\n');
  await chmod(npmPath, 0o755);
  return binDir;
}

describe('pinme CLI success paths with local APIs', () => {
  test('upload posts chunk workflow and prints public and management URLs', async () => {
    const temp = await createTempHome();
    let bundle: Awaited<ReturnType<typeof buildCliWithEnv>> | undefined;
    const server = await startLocalHttpServer((request, response) => {
      const bodyText = request.body.toString('utf8');

      if (request.method === 'POST' && request.url === '/chunk/init') {
        expect(request.headers['token-address']).toBe('0x1234567890abcdef');
        expect(request.headers['authentication-tokens']).toBe('test-token');
        expect(JSON.parse(bodyText)).toMatchObject({
          file_name: 'index.html',
          is_directory: false,
          uid: '0x1234567890abcdef',
          token_address: '0x1234567890abcdef',
          auth_token: 'test-token',
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              session_id: 'session-1',
              total_chunks: 1,
              chunk_size: 1024 * 1024,
            },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/chunk/upload') {
        expect(request.headers['token-address']).toBe('0x1234567890abcdef');
        expect(request.headers['authentication-tokens']).toBe('test-token');
        expect(bodyText).toContain('session-1');
        expect(bodyText).toContain('0x1234567890abcdef');
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: { chunk_index: 0, chunk_size: request.body.length },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/chunk/complete') {
        expect(request.headers['token-address']).toBe('0x1234567890abcdef');
        expect(request.headers['authentication-tokens']).toBe('test-token');
        expect(JSON.parse(bodyText)).toMatchObject({
          session_id: 'session-1',
          uid: '0x1234567890abcdef',
          action: 'upload',
        });
        expect(JSON.parse(bodyText)).not.toHaveProperty('token_address');
        expect(JSON.parse(bodyText)).not.toHaveProperty('auth_token');
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: { trace_id: 'trace-1' },
          }),
        );
        return;
      }

      if (
        request.method === 'GET' &&
        request.url ===
          '/up_status?trace_id=trace-1&uid=0x1234567890abcdef'
      ) {
        expect(request.headers['token-address']).toBe('0x1234567890abcdef');
        expect(request.headers['authentication-tokens']).toBe('test-token');
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              is_ready: true,
              upload_rst: {
                Bytes: 32,
                Name: 'index.html',
                Size: 32,
                Hash: 'bafy-success',
                ShortUrl: 'short-success',
              },
            },
          }),
        );
        return;
      }

      if (request.method === 'GET' && request.url === '/root_domain') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: { domain: 'pinme.test' },
          }),
        );
        return;
      }

      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 404, msg: 'unexpected request' }));
    });

    try {
      bundle = await buildCliWithEnv({
        IPFS_API_URL: server.baseUrl,
        PINME_API_BASE: server.baseUrl,
        POLL_INTERVAL_SECONDS: '0',
        MAX_POLL_TIME_MINUTES: '1',
      });
      await writeAuthConfig(temp.home);
      const result = await runCli(
        ['upload', path.join(repoRoot, 'test', 'fixtures', 'site', 'index.html')],
        {
          home: temp.home,
          cliPath: bundle.cliPath,
          timeout: 20000,
        },
      );

      expect(result.exitCode, outputOf(result)).toBe(0);
      expect(outputOf(result)).toContain('URL');
      expect(outputOf(result)).toContain('https://short-success.pinme.test');
      expect(outputOf(result)).toContain('Management URL');
      expect(outputOf(result)).toContain(
        'https://preview.pinme.test/#/preview/bafy-success',
      );
      expect(server.requests.map((request) => request.url)).toEqual([
        '/chunk/init',
        '/chunk/upload',
        '/chunk/complete',
        '/up_status?trace_id=trace-1&uid=0x1234567890abcdef',
        '/root_domain',
      ]);
    } finally {
      if (bundle) {
        await bundle.cleanup();
      }
      await server.close();
      await temp.cleanup();
    }
  });

  test('upload limits concurrent chunk uploads to five', async () => {
    const temp = await createTempHome();
    let bundle: Awaited<ReturnType<typeof buildCliWithEnv>> | undefined;
    let activeUploads = 0;
    let maxActiveUploads = 0;
    const server = await startLocalHttpServer(async (request, response) => {
      const bodyText = request.body.toString('utf8');

      if (request.method === 'POST' && request.url === '/chunk/init') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              session_id: 'limited-session-1',
              total_chunks: 8,
              chunk_size: 1,
            },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/chunk/upload') {
        expect(bodyText).toContain('limited-session-1');
        activeUploads++;
        maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
        await delay(50);
        activeUploads--;

        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: { chunk_index: 0, chunk_size: request.body.length },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/chunk/complete') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: { trace_id: 'limited-trace-1' },
          }),
        );
        return;
      }

      if (
        request.method === 'GET' &&
        request.url ===
          '/up_status?trace_id=limited-trace-1&uid=0x1234567890abcdef'
      ) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              is_ready: true,
              upload_rst: {
                Bytes: 8,
                Name: 'multi-chunk.txt',
                Size: 8,
                Hash: 'bafy-limited-success',
              },
            },
          }),
        );
        return;
      }

      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 404, msg: 'unexpected request' }));
    });

    try {
      const filePath = path.join(temp.home, 'multi-chunk.txt');
      await writeFile(filePath, '12345678');
      bundle = await buildCliWithEnv({
        IPFS_API_URL: server.baseUrl,
        PINME_API_BASE: server.baseUrl,
        POLL_INTERVAL_SECONDS: '0',
        MAX_POLL_TIME_MINUTES: '1',
      });
      await writeAuthConfig(temp.home);
      const result = await runCli(['upload', filePath], {
        home: temp.home,
        cliPath: bundle.cliPath,
        timeout: 20000,
      });

      expect(result.exitCode, outputOf(result)).toBe(0);
      expect(maxActiveUploads).toBeLessThanOrEqual(5);
      expect(
        server.requests.filter((request) => request.url === '/chunk/upload'),
      ).toHaveLength(8);
    } finally {
      if (bundle) {
        await bundle.cleanup();
      }
      await server.close();
      await temp.cleanup();
    }
  });

  test('bind uploads content and binds a PinMe subdomain', async () => {
    const temp = await createTempHome();
    let bundle: Awaited<ReturnType<typeof buildCliWithEnv>> | undefined;
    const server = await startLocalHttpServer((request, response) => {
      const bodyText = request.body.toString('utf8');

      if (request.method === 'GET' && request.url === '/pay/wallet/balance') {
        expect(request.headers['token-address']).toBe('0x1234567890abcdef');
        expect(request.headers['authentication-tokens']).toBe('test-token');
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            msg: 'ok',
            data: { wallet_balance_usd: 10 },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/check_domain') {
        expect(JSON.parse(bodyText)).toEqual({ domain_name: 'demo-bind' });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: { is_valid: true } }));
        return;
      }

      if (request.method === 'POST' && request.url === '/chunk/init') {
        expect(request.headers['token-address']).toBe('0x1234567890abcdef');
        expect(request.headers['authentication-tokens']).toBe('test-token');
        expect(JSON.parse(bodyText)).toMatchObject({
          file_name: 'index.html',
          is_directory: false,
          uid: '0x1234567890abcdef',
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              session_id: 'bind-session-1',
              total_chunks: 1,
              chunk_size: 1024 * 1024,
            },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/chunk/upload') {
        expect(request.headers['token-address']).toBe('0x1234567890abcdef');
        expect(request.headers['authentication-tokens']).toBe('test-token');
        expect(bodyText).toContain('bind-session-1');
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: { chunk_index: 0, chunk_size: request.body.length },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/chunk/complete') {
        expect(JSON.parse(bodyText)).toMatchObject({
          session_id: 'bind-session-1',
          uid: '0x1234567890abcdef',
          action: 'bind',
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: { trace_id: 'bind-trace-1' },
          }),
        );
        return;
      }

      if (
        request.method === 'GET' &&
        request.url ===
          '/up_status?trace_id=bind-trace-1&uid=0x1234567890abcdef'
      ) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              is_ready: true,
              upload_rst: {
                Bytes: 32,
                Name: 'index.html',
                Size: 32,
                Hash: 'bafy-bind-success',
              },
            },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/bind_pinme_domain') {
        expect(JSON.parse(bodyText)).toEqual({
          domain_name: 'demo-bind',
          hash: 'bafy-bind-success',
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ code: 200, msg: 'ok' }));
        return;
      }

      if (request.method === 'GET' && request.url === '/root_domain') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: { domain: 'pinme.test' },
          }),
        );
        return;
      }

      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 404, msg: 'unexpected request' }));
    });

    try {
      bundle = await buildCliWithEnv({
        IPFS_API_URL: server.baseUrl,
        PINME_API_BASE: server.baseUrl,
        POLL_INTERVAL_SECONDS: '0',
        MAX_POLL_TIME_MINUTES: '1',
      });
      await writeAuthConfig(temp.home);
      const result = await runCli(
        [
          'bind',
          path.join(repoRoot, 'test', 'fixtures', 'site', 'index.html'),
          '--domain',
          'demo-bind',
        ],
        {
          home: temp.home,
          cliPath: bundle.cliPath,
          timeout: 20000,
        },
      );

      expect(result.exitCode, outputOf(result)).toBe(0);
      const output = outputOf(result);
      expect(output).toContain('Wallet balance available: $10.00');
      expect(output).toContain('Domain available: demo-bind');
      expect(output).toContain('Upload success, CID: bafy-bind-success');
      expect(output).toContain('Bind success: demo-bind');
      expect(output).toContain('Visit: https://demo-bind.pinme.test');
      expect(server.requests.map((request) => request.url)).toEqual([
        '/pay/wallet/balance',
        '/check_domain',
        '/chunk/init',
        '/chunk/upload',
        '/chunk/complete',
        '/up_status?trace_id=bind-trace-1&uid=0x1234567890abcdef',
        '/bind_pinme_domain',
        '/root_domain',
      ]);
    } finally {
      if (bundle) {
        await bundle.cleanup();
      }
      await server.close();
      await temp.cleanup();
    }
  });

  test('delete --force posts project deletion and prints success', async () => {
    const temp = await createTempHome();
    const server = await startLocalHttpServer((request, response) => {
      expect(request.method).toBe('POST');
      expect(request.url).toBe('/delete_project');
      expect(request.headers['token-address']).toBe('0x1234567890abcdef');
      expect(request.headers['authentication-tokens']).toBe('test-token');
      expect(JSON.parse(request.body.toString('utf8'))).toEqual({
        project_name: 'demo-project',
      });

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          code: 200,
          data: {
            project_name: 'demo-project',
            domain_deleted: true,
            worker_deleted: true,
            database_deleted: true,
          },
        }),
      );
    });

    try {
      const bundle = await buildCliWithEnv({
        PINME_API_BASE: server.baseUrl,
      });
      await writeAuthConfig(temp.home);
      const result = await runCli(
        ['delete', 'demo-project', '--force'],
        {
          home: temp.home,
          cliPath: bundle.cliPath,
        },
      );

      expect(result.exitCode, outputOf(result)).toBe(0);
      expect(outputOf(result)).toContain('Project deleted successfully');
      expect(server.requests).toHaveLength(1);
      await bundle.cleanup();
    } finally {
      await server.close();
      await temp.cleanup();
    }
  });

  test('update-db uploads SQL files and prints completion', async () => {
    const temp = await createTempHome();
    const server = await startLocalHttpServer((request, response) => {
      expect(request.method).toBe('POST');
      expect(request.url).toBe('/update_db?project_name=fixture-project');
      expect(request.headers['token-address']).toBe('0x1234567890abcdef');
      expect(request.headers['authentication-tokens']).toBe('test-token');
      expect(request.body.toString('utf8')).toContain(
        'CREATE TABLE IF NOT EXISTS notes',
      );

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          code: 200,
          data: {
            results: [
              {
                filename: '001_init.sql',
                status: 'complete',
                num_queries: 1,
                duration: 3,
                changes: 0,
                rows_read: 0,
                rows_written: 0,
              },
            ],
          },
        }),
      );
    });

    try {
      const bundle = await buildCliWithEnv({
        PINME_API_BASE: server.baseUrl,
      });
      await writeAuthConfig(temp.home);
      const result = await runCli(['update-db'], {
        home: temp.home,
        cwd: path.join(repoRoot, 'test', 'fixtures', 'project'),
        cliPath: bundle.cliPath,
      });

      expect(result.exitCode, outputOf(result)).toBe(0);
      expect(outputOf(result)).toContain('Database update complete.');
      expect(server.requests).toHaveLength(1);
      await bundle.cleanup();
    } finally {
      await server.close();
      await temp.cleanup();
    }
  });

  test('import uploads CAR content and binds a PinMe subdomain', async () => {
    const temp = await createTempHome();
    let bundle: Awaited<ReturnType<typeof buildCliWithEnv>> | undefined;
    const server = await startLocalHttpServer((request, response) => {
      const bodyText = request.body.toString('utf8');

      if (request.method === 'POST' && request.url === '/check_domain') {
        expect(JSON.parse(bodyText)).toEqual({ domain_name: 'demo-import' });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: { is_valid: true } }));
        return;
      }

      if (request.method === 'POST' && request.url === '/chunk/init') {
        expect(request.headers['token-address']).toBe('0x1234567890abcdef');
        expect(request.headers['authentication-tokens']).toBe('test-token');
        expect(JSON.parse(bodyText)).toMatchObject({
          file_name: 'index.html',
          is_directory: false,
          uid: '0x1234567890abcdef',
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              session_id: 'import-session-1',
              total_chunks: 1,
              chunk_size: 1024 * 1024,
            },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/chunk/upload') {
        expect(bodyText).toContain('import-session-1');
        expect(bodyText).toContain('0x1234567890abcdef');
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: { chunk_index: 0, chunk_size: request.body.length },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/chunk/complete') {
        expect(JSON.parse(bodyText)).toMatchObject({
          session_id: 'import-session-1',
          uid: '0x1234567890abcdef',
          action: 'import',
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: { trace_id: 'import-trace-1' },
          }),
        );
        return;
      }

      if (
        request.method === 'GET' &&
        request.url ===
          '/up_status?trace_id=import-trace-1&uid=0x1234567890abcdef'
      ) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              is_ready: true,
              upload_rst: {
                Bytes: 32,
                Name: 'index.html',
                Size: 32,
                Hash: 'bafy-import-success',
              },
            },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/bind_pinme_domain') {
        expect(JSON.parse(bodyText)).toEqual({
          domain_name: 'demo-import',
          hash: 'bafy-import-success',
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ code: 200, msg: 'ok' }));
        return;
      }

      if (request.method === 'GET' && request.url === '/root_domain') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: { domain: 'pinme.test' },
          }),
        );
        return;
      }

      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 404, msg: 'unexpected request' }));
    });

    try {
      bundle = await buildCliWithEnv({
        IPFS_API_URL: server.baseUrl,
        PINME_API_BASE: server.baseUrl,
        POLL_INTERVAL_SECONDS: '0',
        MAX_POLL_TIME_MINUTES: '1',
      });
      await writeAuthConfig(temp.home);
      const result = await runCli(
        [
          'import',
          path.join(repoRoot, 'test', 'fixtures', 'site', 'index.html'),
          '--domain',
          'demo-import',
        ],
        {
          home: temp.home,
          cliPath: bundle.cliPath,
          timeout: 20000,
        },
      );

      expect(result.exitCode, outputOf(result)).toBe(0);
      const output = outputOf(result);
      expect(output).toContain('Domain available: demo-import');
      expect(output).toContain('URL');
      expect(output).toContain('bafy-import-success');
      expect(output).toContain('Bind success: demo-import');
      expect(output).toContain(
        'Visit (Pinme subdomain example): https://demo-import.pinme.test',
      );
      expect(server.requests.map((request) => request.url)).toEqual([
        '/check_domain',
        '/chunk/init',
        '/chunk/upload',
        '/chunk/complete',
        '/up_status?trace_id=import-trace-1&uid=0x1234567890abcdef',
        '/bind_pinme_domain',
        '/root_domain',
      ]);
    } finally {
      if (bundle) {
        await bundle.cleanup();
      }
      await server.close();
      await temp.cleanup();
    }
  });

  test('export requests CAR generation and downloads the completed file', async () => {
    const temp = await createTempHome();
    let bundle: Awaited<ReturnType<typeof buildCliWithEnv>> | undefined;
    const cid = 'bafyexportsuccess';
    const outputDir = path.join(temp.home, 'exports');
    const server = await startLocalHttpServer((request, response) => {
      if (
        request.method === 'POST' &&
        request.url ===
          `/car/export?cid=${cid}&uid=0x1234567890abcdef`
      ) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            msg: 'ok',
            data: {
              cid,
              status: 'processing',
              task_id: 'export-task-1',
            },
          }),
        );
        return;
      }

      if (
        request.method === 'GET' &&
        request.url === '/car/export/status?task_id=export-task-1'
      ) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            msg: 'ok',
            data: {
              task_id: 'export-task-1',
              cid,
              status: 'completed',
              download_url: `${server.baseUrl}/downloads/${cid}.car`,
            },
          }),
        );
        return;
      }

      if (request.method === 'GET' && request.url === `/downloads/${cid}.car`) {
        const body = Buffer.from('fixture car payload');
        response.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(body.length),
        });
        response.end(body);
        return;
      }

      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 404, msg: 'unexpected request' }));
    });

    try {
      bundle = await buildCliWithEnv({
        CAR_API_BASE: server.baseUrl,
      });
      await writeAuthConfig(temp.home);
      const result = await runCli(
        ['export', cid, '--output', outputDir],
        {
          home: temp.home,
          cliPath: bundle.cliPath,
          timeout: 20000,
        },
      );

      expect(result.exitCode, outputOf(result)).toBe(0);
      const output = outputOf(result);
      expect(output).toContain('Export task created: export-task-1');
      expect(output).toContain('Export successful');
      expect(output).toContain(`CID: ${cid}`);
      await expect(readFile(path.join(outputDir, `${cid}.car`), 'utf8'))
        .resolves.toBe('fixture car payload');
      expect(server.requests.map((request) => request.url)).toEqual([
        `/car/export?cid=${cid}&uid=0x1234567890abcdef`,
        '/car/export/status?task_id=export-task-1',
        `/downloads/${cid}.car`,
      ]);
    } finally {
      if (bundle) {
        await bundle.cleanup();
      }
      await server.close();
      await temp.cleanup();
    }
  });

  test('create scaffolds a project, deploys worker, and uploads frontend dist', async () => {
    const temp = await createTempHome();
    let bundle: Awaited<ReturnType<typeof buildCliWithEnv>> | undefined;
    const templateZip = createTemplateZipBuffer();
    const server = await startLocalHttpServer((request, response) => {
      const bodyText = request.body.toString('utf8');

      if (request.method === 'POST' && request.url === '/create_worker') {
        expect(request.headers['token-address']).toBe('0x1234567890abcdef');
        expect(request.headers['authentication-tokens']).toBe('test-token');
        expect(JSON.parse(bodyText)).toEqual({
          project_name: 'demo-create',
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              api_domain: 'https://api.demo-create.pinme.test',
              metadata: {
                project_name: 'demo-create',
                bindings: [
                  { name: 'API_KEY', text: 'real-api-key' },
                  { name: 'PROJECT_NAME', text: 'demo-create' },
                ],
              },
              project_name: 'demo-create',
              uuid: 'worker-uuid-1',
              api_key: 'real-api-key',
              public_client_config: {
                auth_api_key: 'public-auth-key',
                auth_domain: 'auth.pinme.test',
                auth_project_id: 'pinme-project',
                tenant_id: 'tenant-1',
              },
            },
          }),
        );
        return;
      }

      if (request.method === 'GET' && request.url === '/template.zip') {
        response.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': String(templateZip.length),
        });
        response.end(templateZip);
        return;
      }

      if (
        request.method === 'PUT' &&
        request.url === '/save_worker?project_name=demo-create'
      ) {
        expect(request.headers['token-address']).toBe('0x1234567890abcdef');
        expect(request.headers['authentication-tokens']).toBe('test-token');
        expect(bodyText).toContain('metadata.json');
        expect(bodyText).toContain('worker.js');
        expect(bodyText).toContain('001_init.sql');
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              sql_results: [
                { filename: '001_init.sql', status: 'complete' },
              ],
            },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/chunk/init') {
        expect(JSON.parse(bodyText)).toMatchObject({
          is_directory: true,
          uid: '0x1234567890abcdef',
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              session_id: 'create-session-1',
              total_chunks: 1,
              chunk_size: 1024 * 1024,
            },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/chunk/upload') {
        expect(bodyText).toContain('create-session-1');
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: { chunk_index: 0, chunk_size: request.body.length },
          }),
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/chunk/complete') {
        expect(JSON.parse(bodyText)).toMatchObject({
          session_id: 'create-session-1',
          uid: '0x1234567890abcdef',
          action: 'project_create',
          project_name: 'demo-create',
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: { trace_id: 'create-trace-1' },
          }),
        );
        return;
      }

      if (
        request.method === 'GET' &&
        request.url ===
          '/up_status?trace_id=create-trace-1&uid=0x1234567890abcdef&project_name=demo-create'
      ) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 200,
            data: {
              is_ready: true,
              upload_rst: {
                Bytes: 64,
                Name: 'dist',
                Size: 64,
                Hash: 'bafy-create-frontend',
              },
            },
          }),
        );
        return;
      }

      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 404, msg: 'unexpected request' }));
    });

    try {
      const fakeBin = await createFakeNpmBin(temp.home);
      bundle = await buildCliWithEnv({
        PINME_API_BASE: server.baseUrl,
        IPFS_API_URL: server.baseUrl,
        PINME_TEMPLATE_ZIP_URL: `${server.baseUrl}/template.zip`,
        POLL_INTERVAL_SECONDS: '0',
        MAX_POLL_TIME_MINUTES: '1',
      });
      await writeAuthConfig(temp.home);
      const result = await runCli(['create', 'Demo-Create', '--force'], {
        home: temp.home,
        cwd: temp.home,
        cliPath: bundle.cliPath,
        timeout: 25000,
        env: {
          PATH: `${fakeBin}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode, outputOf(result)).toBe(0);
      const output = outputOf(result);
      expect(output).toContain('Project created successfully.');
      expect(output).toContain('Worker deployed');
      expect(output).toContain('Frontend URL');
      expect(output).toContain('Project Management URL');

      const projectDir = path.join(temp.home, 'Demo-Create');
      await expect(readFile(path.join(projectDir, 'pinme.toml'), 'utf8'))
        .resolves.toContain('project_name = "demo-create"');
      await expect(readFile(path.join(projectDir, 'pinme.toml'), 'utf8'))
        .resolves.toContain(
          'api_url = "https://api.demo-create.pinme.test"',
        );
      await expect(readFile(path.join(projectDir, 'pinme.toml'), 'utf8'))
        .resolves.toContain(
          'frontend_url = "https://project.pinme.test/demo-create"',
        );
      await expect(
        readFile(path.join(projectDir, 'backend', 'metadata.json'), 'utf8'),
      ).resolves.toContain('"PROJECT_NAME"');
      await expect(
        readFile(
          path.join(projectDir, 'frontend', 'src', 'utils', 'config.ts'),
          'utf8',
        ),
      ).resolves.toContain('public_client_config');
      await expect(
        readFile(path.join(projectDir, 'frontend', 'dist', 'index.html'), 'utf8'),
      ).resolves.toContain('https://api.demo-create.pinme.test');
      expect(server.requests.map((request) => request.url)).toEqual([
        '/create_worker',
        '/template.zip',
        '/save_worker?project_name=demo-create',
        '/chunk/init',
        '/chunk/upload',
        '/chunk/complete',
        '/up_status?trace_id=create-trace-1&uid=0x1234567890abcdef&project_name=demo-create',
      ]);
    } finally {
      if (bundle) {
        await bundle.cleanup();
      }
      await server.close();
      await temp.cleanup();
    }
  });
});
