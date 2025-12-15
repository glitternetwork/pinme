const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const json = require('@rollup/plugin-json');
const typescript = require('@rollup/plugin-typescript');
const { terser } = require('rollup-plugin-terser');
const copy = require('rollup-plugin-copy');
const path = require('path');
const fs = require('fs');

// Ensure dist directory exists
const distDir = path.resolve(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}


module.exports = {
  input: 'bin/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'cjs',
    banner: '#!/usr/bin/env node',
    sourcemap: false,
  },
  // Set all npm dependencies as external, don't bundle into final file
  external: [
    ...Object.keys(require('./package.json').dependencies || {}),
    ...require('module').builtinModules,
  ],
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: false
    }),
    // Resolve third-party modules
    nodeResolve({
      preferBuiltins: true,
    }),
    // Convert CommonJS modules to ES modules
    commonjs(),
    // Support importing JSON files
    json(),
    // Minify code
    terser({
      format: {
        comments: false,
      },
      compress: {
        drop_console: false,
        drop_debugger: true,
      },
    }),
    // Custom plugin: ensure generated file has executable permissions
    {
      name: 'make-executable',
      writeBundle() {
        const outputFile = path.resolve(__dirname, 'dist/index.js');
        try {
          fs.chmodSync(outputFile, '755');
          console.log('Added executable permissions to output file');
        } catch (error) {
          console.error('Failed to add executable permissions:', error);
        }
      }
    }
  ],
  onwarn(warning, warn) {
    // Ignore certain warnings
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    if (warning.code === 'UNRESOLVED_IMPORT' && warning.source.startsWith('node:')) return;
    warn(warning);
  }
};