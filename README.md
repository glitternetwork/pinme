<p align="center">
  <a href="https://pinme.eth.limo/">
    <img src="https://2egc5b44.pinit.eth.limo/" height="92" alt="PinMe logo">
    <h3 align="center">PinMe</h3>
  </a>
</p>

<p align="center">
  Deploy your frontend in one command.
</p>

# PinMe

[PinMe](https://pinme.eth.limo/) is a zero-config deployment CLI for static sites and PinMe full-stack projects.

Build your app, upload the output folder, and PinMe prints the best available public URL. For larger projects, PinMe can also create and deploy a template with a frontend, a Worker backend, and database migrations.

Website: [https://pinme.eth.limo/](https://pinme.eth.limo/)

## Table of Contents

- [Quick Start](#quick-start)
- [Worker and Full-Stack Projects](#worker-and-full-stack-projects)
- [Static Uploads](#static-uploads)
- [For AI Agents](#for-ai-agents)
- [Installation](#installation)
- [Command Reference](#command-reference)
- [Limits and Notes](#limits-and-notes)
- [Examples](#examples)
- [Support](#support)

## Quick Start

### Prerequisites

- Node.js `>= 16.13.0`

Check your version:

```bash
node --version
```

### Create and deploy a full-stack project

```bash
pinme login
pinme create my-app
cd my-app
pinme save
```

If you want the Worker-based project flow first, start with [Worker and Full-Stack Projects](#worker-and-full-stack-projects).

### Upload a static site

If you only want to upload a built frontend, jump to [Static Uploads](#static-uploads).

1. Install the CLI:

```bash
npm install -g pinme
```

2. Authenticate:

```bash
pinme login

# Or use an AppKey for CLI / CI usage
pinme set-appkey <AppKey>
```

3. Build your app:

```bash
npm run build
```

4. Upload the build output:

```bash
pinme upload dist

# Other common output folders
pinme upload build
pinme upload out
pinme upload public
```

PinMe prints the final public URL after upload. If no custom domain is bound, it can fall back to a preview URL such as `https://pinme.eth.limo/#/preview/*`.

## For AI Agents

This section is the low-ambiguity workflow for agents using PinMe to deploy static output.

### Goal

Upload static files with PinMe and return the final public URL printed by the CLI.

### Required steps

1. Check Node.js:

```bash
node --version
```

2. Ensure PinMe is installed:

```bash
npm install -g pinme
```

3. Authenticate before upload:

```bash
pinme login

# Or:
pinme set-appkey <AppKey>
```

4. Find the static output directory in this order:

- `dist/`
- `build/`
- `out/`
- `public/`

Validation rules:

- the directory must exist
- it should contain `index.html` for website deployment
- it should contain built static assets rather than source files

5. Upload the directory:

```bash
pinme upload <folder>
```

6. Return only the final public URL.

URL priority:

1. DNS domain
2. PinMe subdomain
3. short URL
4. preview URL

### Important guardrails

- Do not upload `node_modules`, `.git`, `.env`, or source folders such as `src/`.
- Do not upload config files like `package.json` or `tsconfig.json`.
- For SPAs, hash-based routing is safer on IPFS than history mode for deep links.
- If no suitable build directory exists, ask the user for the correct upload path.

### Machine-readable summary

```json
{
  "tool": "pinme",
  "requirements": {
    "node_version": ">=16.13.0"
  },
  "install": "npm install -g pinme",
  "login": "pinme login",
  "set_appkey": "pinme set-appkey <AppKey>",
  "auth_required_for_upload": true,
  "upload": "pinme upload {{directory}}",
  "upload_with_domain": "pinme upload {{directory}} --domain {{domain}}",
  "upload_with_dns": "pinme upload {{directory}} --domain {{domain}} --dns",
  "valid_directories": ["dist", "build", "out", "public"],
  "required_files": ["index.html"],
  "exclude_patterns": ["node_modules", ".env", ".git", "src"],
  "limits": {
    "single_file_default": "100MB",
    "total_directory_default": "500MB"
  },
  "output": "public_url",
  "url_priority": ["dns_domain", "pinme_domain", "short_url", "preview_url"]
}
```

## Installation

Install from npm:

```bash
npm install -g pinme
```

Verify installation:

```bash
pinme --version
```

## Worker and Full-Stack Projects

PinMe can create and deploy a full-stack template with:

- frontend
- Worker backend
- SQL migrations

### Create and deploy

```bash
pinme login
pinme create my-app
cd my-app
pinme save
```

`create` downloads the PinMe template and initializes the platform project. `save` builds and deploys the project from the current PinMe project root.

### Targeted updates

Use these when only one layer changed:

```bash
pinme update-web
pinme update-worker
pinme update-db
```

Notes:

- run these commands from a PinMe project root that contains `pinme.toml`
- `update-db` uploads SQL files from `db/`
- the total SQL payload for `update-db` is limited to `10MB` per run

### Delete a platform project

```bash
pinme delete
pinme delete my-app
pinme delete my-app --force
```

This deletes the project on the platform. Local files remain unchanged.

## Static Uploads

### Upload files or folders

`upload` requires authentication.

```bash
pinme login
pinme upload
pinme upload ./dist
```

### Bind a domain

Domain binding requires wallet balance.

```bash
pinme upload ./dist --domain my-site
pinme upload ./dist --domain example.com
pinme upload ./dist --domain my-site --dns

# Or use the dedicated command
pinme bind ./dist --domain my-site
```

Domain handling:

- domains with a dot are treated as DNS domains
- domains without a dot are treated as PinMe subdomains
- `--dns` forces DNS mode

### Import a CAR file

`import` also requires authentication.

```bash
pinme import
pinme import ./site.car
pinme import ./site.car --domain my-site
```

### Export a CAR file

`export` takes a CID and writes `<cid>.car` into the output directory.

```bash
pinme export <CID>
pinme export <CID> --output ./exports
```

### Remove uploaded content

`rm` accepts several input formats, including direct CID, subname, and supported URL forms.

```bash
pinme rm
pinme rm <CID>
pinme rm <subname>
pinme rm https://<subname>.<root-domain>
```

## Usage

### Authentication

```bash
pinme login
pinme login --env test

pinme set-appkey
pinme set-appkey <AppKey>

pinme show-appkey
pinme appkey

pinme logout
```

### History and account info

```bash
pinme list
pinme ls
pinme list -l 5
pinme list -c

pinme my-domains
pinme domain

pinme wallet
pinme wallet-balance
pinme balance
```

## Command Reference

| Command | What it does |
| --- | --- |
| `pinme upload [path]` | Upload a file or directory to IPFS |
| `pinme bind <path> --domain <name>` | Upload and bind a domain |
| `pinme import [path]` | Import a CAR file |
| `pinme export <cid> [--output <dir>]` | Export a CID as a CAR file into a directory |
| `pinme rm [value]` | Remove uploaded content by CID, subname, or supported URL form |
| `pinme login [--env dev|test|prod]` | Browser-based login |
| `pinme set-appkey [AppKey]` | Set authentication with an AppKey |
| `pinme show-appkey` / `pinme appkey` | Show masked AppKey info |
| `pinme my-domains` / `pinme domain` | List bound domains |
| `pinme wallet` / `pinme wallet-balance` / `pinme balance` | Show wallet balance |
| `pinme create [name]` | Create a new PinMe full-stack project |
| `pinme save [--domain <name>]` | Build and deploy a PinMe full-stack project |
| `pinme update-web` | Deploy frontend only |
| `pinme update-worker` | Deploy Worker only |
| `pinme update-db` | Run SQL migrations only |
| `pinme delete [name] [--force]` | Delete a platform project |
| `pinme list` / `pinme ls` | Show upload history |
| `pinme help` | Show CLI help |

## Limits and Notes

- Default upload file size limit: `100MB`
- Default upload directory size limit: `500MB`
- These defaults come from the CLI and can be overridden with environment variables
- Domain binding requires wallet balance
- `upload` and `import` require authentication
- PinMe subdomain root is resolved dynamically by the platform, so the CLI prints the exact final URL

## Examples

This repo includes example projects and docs:

- [example/docs](./example/docs)
- [example/pinme-blog](./example/pinme-blog)
- [example/supabase](./example/supabase)

## Support

- Website: [https://pinme.eth.limo/](https://pinme.eth.limo/)
- GitHub: [https://github.com/glitternetwork/pinme](https://github.com/glitternetwork/pinme)
