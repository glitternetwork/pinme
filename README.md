<p align="center">
  <a href="https://pinme.eth.limo/">
    <img src="https://2egc5b44.pinit.eth.limo/" height="92" alt="PinMe logo">
    <h3 align="center">PinMe</h3>
  </a>
</p>

<p align="center">
  Create and deploy your web in one command.
</p>

# PinMe

[PinMe](https://pinme.eth.limo/) is a zero-config deployment CLI focused on one-command creation and deployment for full-stack projects.

It lets you quickly set up and launch a complete project with an integrated frontend, Worker backend, and database, without tedious configuration. PinMe is built to make full-stack delivery much simpler and significantly improve development efficiency.

Website: [https://pinme.eth.limo/](https://pinme.eth.limo/)

## Table of Contents

- [Quick Start](#quick-start)
- [For AI Agents](#for-ai-agents)
- [Installation](#installation)
- [PinMe Project Workflow](#pinme-project-workflow)
- [Authentication and Account Commands](#authentication-and-account-commands)
- [Static Uploads and IPFS Utilities](#static-uploads-and-ipfs-utilities)
- [Command Reference](#command-reference)
- [Limits and Operational Notes](#limits-and-operational-notes)
- [Examples](#examples)
- [Support](#support)

## Quick Start

### Prerequisites

- Node.js `>= 16.13.0`

### Create a new Worker project

```bash
npm install -g pinme
pinme login
pinme create my-app
cd my-app
pinme save
```

What this workflow gives you:

- a generated PinMe project from the official template
- platform-side Worker and database provisioning
- local project config in `pinme.toml`
- frontend and Worker deployment from one CLI

### Update only the part you changed

```bash
pinme update-worker
pinme update-db
pinme update-web
```

### Upload a static build when you do not need the project workflow

```bash
pinme login
pinme upload dist
```

Common build directories are `dist`, `build`, `out`, and `public`.

## For AI Agents

Prefer the PinMe project workflow when the user wants a frontend plus backend plus database, or when the repo already contains `pinme.toml`.

### Project-mode protocol

Use this flow when the user wants a Worker app, database migrations, or ongoing project updates.

1. Check Node.js:

```bash
node --version
```

2. Ensure the CLI is available:

```bash
npm install -g pinme
```

3. Authenticate:

```bash
pinme login
```

4. Choose the right project command:

- create a new project: `pinme create <name>`
- deploy everything from a PinMe project root: `pinme save`
- update Worker only: `pinme update-worker`
- update SQL migrations only: `pinme update-db`
- update frontend only: `pinme update-web`

5. If the repo contains `pinme.toml`, run project commands from that directory.

6. Return the final project URL printed by the CLI for frontend deploys. For Worker-only or DB-only updates, return the relevant success result instead of fabricating a URL.

### Static-upload fallback

Use this only when the task is just "publish the built frontend" and there is no PinMe project workflow involved.

1. Authenticate:

```bash
pinme login
```

Or for automation:

```bash
pinme set-appkey <AppKey>
```

2. Find the built output directory in this order:

- `dist/`
- `build/`
- `out/`
- `public/`

3. Verify the directory exists and contains built assets such as `index.html`.

4. Upload it:

```bash
pinme upload <folder>
```

### Guardrails

- Do not upload source folders such as `src/`.
- Do not upload `node_modules`, `.git`, or `.env`.
- Do not claim unsupported backend hosting outside the PinMe project template flow.
- For project commands, do not run `update-*` commands outside a PinMe project root with `pinme.toml`.

## Installation

Install from npm:

```bash
npm install -g pinme
```

Verify installation:

```bash
pinme --version
```

## PinMe Project Workflow

### What `create` sets up

`pinme create <name>` does more than scaffold files. The command:

- requires an authenticated session
- creates the platform project resources first
- downloads the official Worker project template
- writes project metadata into `pinme.toml`
- writes backend metadata and frontend config files
- installs workspace dependencies
- builds the Worker
- uploads Worker code and SQL files
- builds the frontend and attempts an initial frontend upload

After creation, the CLI prints the project management URL and suggests `pinme save` for the next deploy.

### Create a project

```bash
pinme login
pinme create my-app
```

If the target directory already exists, the CLI asks before overwriting it unless `--force` is used.

### Deploy the whole project

Run this from the project root that contains `pinme.toml`:

```bash
pinme save
pinme save --domain my-site
pinme save --domain example.com
```

`save` performs the full deploy path:

- installs project dependencies
- builds the Worker with `npm run build:worker`
- uploads Worker code and SQL files from `db/`
- builds the frontend with `npm run build:frontend`
- uploads `frontend/dist`
- optionally binds a domain after the frontend deploy

### Update only one layer

Use targeted commands when only one part changed:

```bash
pinme update-worker
pinme update-db
pinme update-web
```

What each command expects:

- `update-worker`: builds and uploads Worker code from the current PinMe project
- `update-db`: uploads `.sql` files from `db/`
- `update-web`: builds and uploads `frontend/dist`

### Delete a project

```bash
pinme delete
pinme delete my-app
pinme delete my-app --force
```

This deletes the platform-side Worker, domain binding, and D1 database. Local files remain unchanged.

## Authentication and Account Commands

### Login and AppKey

```bash
pinme login
pinme login --env test

pinme set-appkey
pinme set-appkey <AppKey>

pinme show-appkey
pinme appkey

pinme logout
```

Notes:

- `pinme login` is the recommended path for project commands.
- `set-appkey` is the alternative authentication method for CLI and automation usage.

### Domains, wallet, and history

```bash
pinme my-domains
pinme domain

pinme wallet
pinme wallet-balance
pinme balance

pinme list
pinme ls
pinme list -l 5
pinme list -c
```

## Static Uploads and IPFS Utilities

These commands are useful when you already have artifacts and do not need the full Worker project flow.

### Upload a directory or file

```bash
pinme upload
pinme upload ./dist
pinme upload ./dist --domain my-site
pinme upload ./dist --domain example.com
pinme upload ./dist --domain my-site --dns
```

Domain handling:

- domains containing a dot are treated as DNS domains
- domains without a dot are treated as PinMe subdomains
- `--dns` forces DNS mode

### Bind while uploading

```bash
pinme bind ./dist --domain my-site
pinme bind ./dist --domain example.com
```

`bind` requires wallet balance.

### Import or export CAR files

```bash
pinme import
pinme import ./site.car
pinme import ./site.car --domain my-site

pinme export <cid>
pinme export <cid> --output ./exports
```

### Remove uploaded content

```bash
pinme rm
pinme rm <value>
```

## Command Reference

| Command                                                   | What it does                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| `pinme create [name]`                                     | Create a new PinMe Worker project from the official template |
| `pinme save [--domain <name>]`                            | Deploy the current PinMe project: Worker, SQL, and frontend  |
| `pinme update-worker`                                     | Build and upload Worker code only                            |
| `pinme update-db`                                         | Upload SQL migrations from `db/` only                        |
| `pinme update-web`                                        | Build and upload the frontend only                           |
| `pinme delete [name] [--force]`                           | Delete a platform project                                    |
| `pinme upload [path]`                                     | Upload a file or directory to IPFS                           |
| `pinme bind [path] --domain <name>`                       | Upload and bind a domain                                     |
| `pinme import [path]`                                     | Import a CAR file                                            |
| `pinme export <cid> [--output <dir>]`                     | Export IPFS content as a CAR file                            |
| `pinme rm [value]`                                        | Remove uploaded content                                      |
| `pinme login [--env test\|prod]`                          | Login via browser                                            |
| `pinme set-appkey [AppKey]`                               | Set authentication with an AppKey                            |
| `pinme show-appkey` / `pinme appkey`                      | Show masked AppKey info                                      |
| `pinme my-domains` / `pinme domain`                       | List domains owned by the current account                    |
| `pinme wallet` / `pinme wallet-balance` / `pinme balance` | Show current wallet balance                                  |
| `pinme list` / `pinme ls`                                 | Show upload history                                          |
| `pinme help`                                              | Show CLI help                                                |

## Limits and Operational Notes

- Default single-file upload limit: `100MB`
- Default directory upload limit: `500MB`
- These upload defaults come from the CLI and can be overridden with environment variables
- `update-db` enforces a total SQL payload limit of `10MB` per run
- `upload`, `import`, and project commands require authentication
- domain binding requires wallet balance
- `save`, `update-worker`, `update-db`, and `update-web` expect to run from a PinMe project root with `pinme.toml`

## Examples

This repo includes example projects and docs:

- [example/docs](./example/docs)
- [example/pinme-blog](./example/pinme-blog)
- [example/supabase](./example/supabase)

## Support

- Website: [https://pinme.eth.limo/](https://pinme.eth.limo/)
- GitHub: [https://github.com/glitternetwork/pinme](https://github.com/glitternetwork/pinme)
