require('dotenv').config();
const esbuild = require('esbuild');
const { createDefineMap } = require('./build-env');

const define = createDefineMap();

esbuild.build({
  entryPoints: ['bin/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node14',
  format: 'cjs',
  external: Object.keys(require('./package.json').dependencies || {}).filter(dep => dep !== 'axios'),
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
  define,
}).catch(() => process.exit(1)); 
