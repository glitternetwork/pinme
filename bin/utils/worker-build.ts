/**
 * Bundles the user's src/worker.ts into a single JS string
 * using esbuild. The bundle is sent to api.pinme.pro for deployment.
 */

import path from 'path';
import fs from 'fs-extra';
import esbuild from 'esbuild';

export interface BuildResult {
  code: string;
  sizeBytes: number;
}

export async function buildWorker(cwd: string = process.cwd()): Promise<BuildResult> {
  const entryPoint = path.join(cwd, 'src', 'worker.ts');

  if (!fs.existsSync(entryPoint)) {
    // Also accept worker.js
    const jsEntry = path.join(cwd, 'src', 'worker.js');
    if (!fs.existsSync(jsEntry)) {
      throw new Error('Entry point not found. Expected src/worker.ts or src/worker.js.');
    }
  }

  const result = await esbuild.build({
    entryPoints: [fs.existsSync(path.join(cwd, 'src', 'worker.ts'))
      ? path.join(cwd, 'src', 'worker.ts')
      : path.join(cwd, 'src', 'worker.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser', // CF Workers target
    target: 'es2022',
    write: false,
    minify: false,
    logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });

  const code = result.outputFiles[0].text;
  return { code, sizeBytes: Buffer.byteLength(code, 'utf-8') };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
