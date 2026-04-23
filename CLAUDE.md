# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PinMe is a zero-config CLI tool for deploying static sites to IPFS. Built with TypeScript, bundled with esbuild, published to npm as `pinme`. Users run commands like `pinme upload dist` to deploy frontends.

## Build & Dev

```bash
npm run build          # Production build (esbuild → dist/index.js)
npm run dev            # Dev build (NODE_ENV=development)
node test/build-env.test.js  # Run tests (node:test, no framework)
```

Build uses `build.js` (esbuild), NOT `rollup.config.js` (legacy, unused). esbuild reads `.env` via dotenv at build time and injects env vars as `process.env.*` defines.

The output is a single CJS file at `dist/index.js` with a shebang, used as the `pinme` CLI binary.

## Architecture

- `bin/index.ts` — CLI entry point, uses `commander` to register all commands
- `bin/*.ts` — Individual command implementations (upload, save, create, bind, importCar, exportCar, delete, etc.)
- `bin/utils/` — Shared utilities:
  - `config.ts` — `APP_CONFIG` singleton, all API base URLs and tuning knobs from env vars
  - `apiClient.ts` — Axios client factory (`createPinmeApiClient`, `createCarApiClient`)
  - `pinmeApi.ts` — High-level API wrappers (domain binding, wallet, CAR export, etc.)
  - `uploadToIpfs.ts` / `uploadToIpfsSplit.ts` — IPFS upload logic (single file vs chunked)
  - `webLogin.ts` — Auth token management (reads from `~/.pinme/`)
  - `domainValidator.ts` — Domain name validation and DNS vs subdomain detection
  - `cliError.ts` — Structured CLI error types
- `bin/services/uploadService.ts` — Upload orchestration (hash encryption, URL generation)
- `skills/` — Claude Code skill definitions for this project

## Key Patterns

- Auth: AppKey stored locally at `~/.pinme/`. Auth headers injected via `getAuthHeaders()` in `webLogin.ts`.
- API clients: Always use `createPinmeApiClient()` or `createCarApiClient()` from `apiClient.ts`, never raw axios.
- Token expiry: `pinmeApi.ts` has centralized token-expired detection (`isTokenExpired`) — all API calls should go through wrappers there.
- Config: All env-driven config lives in `APP_CONFIG` (`config.ts`). Don't read `process.env` directly elsewhere.
- The `save` command reads `pinme.toml` from project root for full-stack deploy (frontend + Cloudflare Worker + D1).

## Code Style

- Prettier: single quotes, trailing commas, 80 char width
- TypeScript with `strict: false`, target ESNext, module ESNext
- CLI output uses `chalk` for colors, `ora` for spinners, `inquirer` for prompts, `figlet` for banner
