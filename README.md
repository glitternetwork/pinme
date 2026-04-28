<p align="center">
  <a href="https://pinme.eth.limo/">
    <img src="https://2egc5b44.pinit.eth.limo/" height="92">
    <h3 align="center">PinMe</h3>
  </a>
</p>

<p align="center">
  Deploy your site in one command.
</p>

<br/>

# PinMe

[PinMe](https://pinme.eth.limo/) is a zero-config frontend deployment tool.
No servers to manage. Minimal setup.

Build a static site, generate a page with AI, export your frontend, or import CAR files — then deploy instantly with a single command.

PinMe publishes your site as verifiable content, making silent tampering and accidental breakage far harder than traditional hosting.

You don’t manage servers, regions, or uptime.
PinMe handles availability and persistence for you.

Website: [https://pinme.eth.limo/](https://pinme.eth.limo/)

---

## Table of Contents

- [Quick Start](#quick-start)
- [For AI](#for-ai)
- [Installation](#installation)
- [Usage](#usage)
- [Bind Domain](#bind-domain-requires-wallet-balance)
- [Full-Stack Projects](#full-stack-projects)
- [Command Details](#command-details)
- [Wallet Billing](#wallet-billing)
- [Common Static File Directories](#common-static-file-directories)
- [Error Handling](#error-handling)
- [Upload Limits](#upload-limits)
- [GitHub Actions Integration](#github-actions-integration)
- [Contact Us](#contact-us)

---

## Quick Start

### Prerequisites
- **Node.js 16.13.0 or higher** required

```bash
# Check your Node.js version
node --version
```

### Four Steps to Deploy

1. **Install PinMe**
```bash
npm install -g pinme
```

2. **Login or set AppKey**
```bash
# Recommended: browser login
pinme login

# Or use an AppKey in CLI/CI environments
pinme set-appkey <AppKey>
```

3. **Build your project** (if not already built)
```bash
# For Vite/React/Vue projects
npm run build

# For Next.js (static export)
npm run build
```

4. **Upload to PinMe**
```bash
# Upload the dist directory (most common)
pinme upload dist

# Or upload build directory
pinme upload build
```

That's it! PinMe prints the best available public URL. If no domain is available, it falls back to a preview URL like `https://pinme.eth.limo/#/preview/*`.

---

## For AI

This section provides AI-specific instructions for deploying websites using PinMe CLI.

### AI Execution Protocol

**Goal:** Use PinMe CLI to upload static files to PinMe/IPFS and return the final public URL.

#### Required Steps

1. **Check Environment Requirements**
   ```bash
   # Check Node.js version (requires 16.13.0+)
   node --version
   ```

2. **Install PinMe CLI** (if not installed)
   ```bash
   npm install -g pinme
   ```

3. **Authenticate before upload**
   ```bash
   # Recommended
   pinme login

   # Or for automation / non-browser environments
   pinme set-appkey <AppKey>
   ```

4. **Identify the Static File Directory**
   Priority order to check:
   - `dist/` - Default output directory for Vue/React/Vite projects
   - `build/` - Output directory for Create React App
   - `out/` - Output directory for Next.js static export
   - `public/` - Pure static file projects

   **Validation Rules:**
   - Folder must exist
   - Must contain `index.html` file (for website deployment)
   - Must contain actual static resource files (CSS, JS, images, etc.)

   If no suitable folder is found, ask the user to specify the upload path.

   **Router Mode Check:**
   - Ensure the project uses **hash mode** router (e.g., `/#/about`)
   - History mode (e.g., `/about`) will cause 404 on sub-routes when deployed to IPFS
   - For React: use `HashRouter` instead of `BrowserRouter`
   - For Vue: use `createHashHistory()` instead of `createWebHistory()`

5. **Execute Deployment Command**
   ```bash
   pinme upload <folder_path>
   ```

6. **Return Result**
   - Only return the final URL printed by PinMe
   - URL priority is: DNS domain > Pinme subdomain > short URL > hash preview URL
   - Hash fallback format: `https://pinme.eth.limo/#/preview/*`
   - Do not output additional logs or intermediate steps

#### Prohibited Operations

- ❌ Do not upload `node_modules`, `.env`, `.git` directories
- ❌ Do not upload source code directories (like `src/`)
- ❌ Do not upload config files (like package.json, tsconfig.json, etc.)
- ❌ Do not attempt to upload non-existent or empty folders

### Machine-Readable Configuration

For easy AI tool parsing:

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
  "validDirectories": ["dist", "build", "out", "public"],
  "requiredFiles": ["index.html"],
  "excludePatterns": ["node_modules", ".env", ".git", "src"],
  "limits": {
    "single_file": "200MB",
    "total_directory": "1GB"
  },
  "output": "public_url",
  "url_priority": ["dns_domain", "pinme_domain", "short_url", "hash_preview_url"],
  "preview_url_format": "https://pinme.eth.limo/#/preview/*",
  "pinme_domain_format": "https://<name>.<root-domain>",
  "dns_domain_format": "https://<your-domain>",
  "other_commands": {
    "version": "pinme --version",
    "list": "pinme list",
    "import": "pinme import <car-file>",
    "export": "pinme export <cid>",
    "set_appkey": "pinme set-appkey",
    "show_appkey": "pinme show-appkey",
    "my_domains": "pinme my-domains",
    "wallet": "pinme wallet",
    "bind": "pinme bind <path> --domain <domain>",
    "create": "pinme create <project-name>",
    "save": "pinme save",
    "update_db": "pinme update-db",
    "update_worker": "pinme update-worker",
    "update_web": "pinme update-web",
    "delete": "pinme delete <project-name>",
    "remove": "pinme rm <hash>",
    "logout": "pinme logout",
    "help": "pinme help"
  }
}
```

### AI Usage Template

> **Deployment Request:**
> Please read the PinMe documentation, then use PinMe CLI to deploy the specified website by uploading static files to PinMe/IPFS.
>
> **Operation Steps:**
> 1. Check Node.js version (requires 16.13.0+)
> 2. Check if pinme is installed, install if not
> 3. Authenticate with `pinme login` or `pinme set-appkey <AppKey>`
> 4. Identify the static file directory for the website to deploy
> 5. Execute deployment command
> 6. Return the final public URL printed by PinMe. If no custom URL is available, return the preview page link: `https://pinme.eth.limo/#/preview/*`

---

## Installation

### Using npm

```bash
npm install -g pinme
```

### Using yarn

```bash
yarn global add pinme
```

### Verify Installation

```bash
# Check PinMe version
pinme --version
```

---

## Usage

### Upload Files or Directories

```bash
# Login is required before upload
pinme login

# Interactive upload
pinme upload

# Specify path directly
pinme upload /path/to/file-or-directory
```

**Authentication requirement:** `pinme upload` and `pinme import` require a valid login session or AppKey. Use `pinme login` for browser login, or `pinme set-appkey <AppKey>` for CLI/CI environments.

### Bind Domain (requires wallet balance)

```bash
# Upload and bind to a domain (auto-detected: Pinme subdomain or DNS domain)
pinme upload <path> --domain <name>
pinme upload <path> -d <name>
```

**Smart Auto-Detection:**
- Domains with a dot (e.g., `example.com`) → **DNS domain**
- Domains without a dot (e.g., `my-site`) → **Pinme subdomain**

**Examples:**
```bash
# Bind to a Pinme subdomain (auto-detected)
pinme upload ./dist --domain my-site

# Bind to a DNS domain (auto-detected by the dot)
pinme upload ./dist --domain example.com

# Force DNS mode if needed
pinme upload ./dist --domain my-site --dns
```

### Full-Stack Projects

PinMe can also create and deploy a full-stack project template with frontend, Worker backend, and database migrations.

```bash
# Login with the browser-based flow
pinme login

# Create a new project from the PinMe worker template
pinme create my-app

# Enter the project and deploy frontend + backend + database
cd my-app
pinme save
```

Use targeted update commands when only one layer changed:

```bash
# Deploy frontend only
pinme update-web

# Deploy backend Worker only
pinme update-worker

# Run database SQL migrations only
pinme update-db
```

Delete a platform project when needed:

```bash
# From a PinMe project directory
pinme delete

# Or specify a project name
pinme delete my-app

# Skip confirmation
pinme delete my-app --force
```

### Import CAR files

```bash
# Login is required before import
pinme login

# Interactive CAR import
pinme import

# Specify CAR file path directly
pinme import /path/to/car-file.car

# Import CAR file and bind to a domain
pinme import /path/to/car-file.car --domain <name>
pinme import /path/to/car-file.car -d <name>
```

### Export IPFS Content as CAR files

```bash
# Interactive CAR export
pinme export

# Specify CID directly
pinme export <CID>

# Export with custom output path
pinme export <CID> --output /path/to/output.car
pinme export <CID> -o /path/to/output.car
```

**Note:** By default, exported CAR files are saved to your system's Downloads directory.

### View Upload History

```bash
# Show the last 10 upload records
pinme list

# Or use the shorthand command
pinme ls

# Limit the number of records shown
pinme list -l 5

# Clear all upload history
pinme list -c
```

### Remove Files from IPFS

```bash
# Interactive removal
pinme rm

# Remove a specific file by hash
pinme rm <IPFS_hash>
```

### Authentication (AppKey)

```bash
# Browser login, recommended for full-stack project commands
pinme login

# Use a specific environment when needed
pinme login --env test

# Set AppKey for login and domain binding
pinme set-appkey

# View current AppKey info (masked)
pinme show-appkey
pinme appkey

# Log out
pinme logout

# View your domains
pinme my-domains
pinme domain

# View wallet balance
pinme wallet
pinme wallet-balance
pinme balance
```

### Get Help

```bash
# Display help information
pinme help
```

---

## 📁 Common Static File Directories

### Automatic Detection

PinMe automatically detects these common output directories (in priority order):

| Directory | Framework/Tool | Description |
|-----------|---------------|-------------|
| `dist/` | Vite, Vue CLI, Angular | Default output directory |
| `build/` | Create React App | CRA output directory |
| `out/` | Next.js | Static export output |
| `public/` | Static sites | Pure static file projects |

### Validation Rules

The selected directory must meet:
- ✅ Folder exists
- ✅ Contains `index.html` file (for website deployment)
- ✅ Contains actual static resource files (CSS, JS, images, etc.)

### What NOT to Upload

- ❌ `node_modules/` - Dependency folder
- ❌ `.git/` - Version control
- ❌ `.env` - Environment configuration
- ❌ `src/` - Source code directory
- ❌ `package.json`, `tsconfig.json` - Config files

---

## Command Details

### `bind`

Upload files and bind them to a custom domain. **Domain binding deducts from your wallet balance.**

```bash
pinme bind [path] [options]
```

**Options:**
- `path`: Path to the file or directory to upload (optional, interactive if not provided)
- `-d, --domain <name>`: Domain name to bind (required)
- `--dns`: Force DNS domain mode (optional, auto-detected from domain format)

**Examples:**
```bash
# Interactive mode (will prompt for path and domain)
pinme bind

# Bind a path with the dedicated bind command
pinme bind ./dist --domain my-site

# Bind to a Pinme subdomain (auto-detected: no dot in domain)
pinme upload ./dist --domain my-site

# Bind to a DNS domain (auto-detected: contains dot)
pinme upload ./dist --domain example.com

# Force DNS mode with --dns flag
pinme upload ./dist --domain my-site --dns
```

**Auto-Detection:**
- Domains with a dot (e.g., `example.com`) are automatically treated as **DNS domains**
- Domains without a dot (e.g., `my-site`) are automatically treated as **Pinme subdomains**
- Use `--dns` or `-D` flag to force DNS domain mode when needed

**Requirements:**
- Login or AppKey authentication is required before upload/bind
- Sufficient wallet balance is required for domain binding
- Valid AppKey must be set (run: `pinme set-appkey <AppKey>`)
- For DNS domains, you must own the domain

**URL Formats:**
- Pinme subdomain: `https://<name>.<root-domain>`
- DNS domain: `https://<your-domain>`

**DNS Setup:**
After successful DNS domain binding, visit the [DNS Configuration Guide](https://pinme.eth.limo/#/docs?id=custom-domain) to complete DNS setup.

### `upload`

Upload a file or directory to the IPFS network.

```bash
pinme upload [path] [--domain <name>]
```

**Options:**
- `path`: Path to the file or directory to upload (optional, interactive if not provided)
- `-d, --domain <name>`: Pinme subdomain or DNS domain to bind after upload (optional, requires wallet balance)
- `--dns`, `-D`: Force DNS domain mode

**Authentication:** This command requires login. Run `pinme login` first, or configure `pinme set-appkey <AppKey>`.

**Examples:**
```bash
# Upload dist directory
pinme upload dist

# Upload only (no domain binding)
pinme upload dist

# Upload a specific file
pinme upload ./example.jpg
```

**Note:** Domain binding during upload requires available wallet balance. Use the `bind` command for domain binding.

**Printed URL priority:** PinMe displays the best available final URL in this order:
1. DNS domain, for example `https://example.com`
2. Pinme subdomain, for example `https://my-site.<root-domain>`
3. Short URL returned by the upload service
4. Hash preview URL, for example `https://pinme.eth.limo/#/preview/*`

When the backend returns a Pinme subdomain without the root domain, the CLI automatically appends the current root domain before printing it.

### `import`

Import CAR (Content Addressable aRchive) files to the IPFS network. This command is specifically designed for importing CAR files while maintaining their original structure. Supports binding to a Pinme subdomain after import.

```bash
pinme import [path] [--domain <name>]
```

**Options:**
- `path`: Path to the CAR file to import (optional, if not provided, interactive mode will be entered)
- `-d, --domain <name>`: Pinme subdomain to bind after import (optional)

**Authentication:** This command requires login. Run `pinme login` first, or configure `pinme set-appkey <AppKey>`.

**Examples:**
```bash
# Interactive CAR import
pinme import

# Import a specific CAR file
pinme import ./my-archive.car

# Import CAR file and bind to a domain
pinme import ./my-archive.car --domain my-archive
pinme import ./my-archive.car -d my-archive
```

**Key Differences from `upload`:**
- CAR files are imported with their original structure preserved
- Uses IPFS CAR import protocol for efficient content addressing
- Ideal for importing previously exported IPFS content
- Same domain binding and management features as `upload`

### `export`

Export IPFS content as a CAR (Content Addressable aRchive) file.

```bash
pinme export [CID] [--output <path>]
```

**Options:**
- `CID`: IPFS content identifier (CID) to export (optional, interactive if not provided)
- `-o, --output <path>`: Output file path for the CAR file (optional, defaults to Downloads directory)

**Examples:**
```bash
# Interactive CAR export
pinme export

# Export a specific CID
pinme export bafybeiakzpeep2jw5cvsyfa66nqxmjurmarw3a34moxpgrbz7s75v7nune

# Export with custom output path
pinme export bafybeiakzpeep2jw5cvsyfa66nqxmjurmarw3a34moxpgrbz7s75v7nune --output ./my-export.car
pinme export bafybeiakzpeep2jw5cvsyfa66nqxmjurmarw3a34moxpgrbz7s75v7nune -o ./my-export.car
```

**Features:**
- Exports IPFS content as CAR files for backup or migration
- Default output location: system Downloads directory (`~/Downloads` on macOS/Linux, `%USERPROFILE%\Downloads` on Windows)
- Supports interactive mode for easy CID input
- Shows progress during export generation and file download
- CAR files preserve original content structure and CID relationships

**Note:** Export is an asynchronous process. The command will:
1. Request export task creation
2. Poll export status (every 5 seconds) until completion
3. Download the generated CAR file to your specified location

### `rm`

Remove a file from the IPFS network.

```bash
pinme rm [hash]
```

**Note:** This unpins content from our IPFS node and deletes the ENS subdomain record. It does not guarantee removal from the entire IPFS network.

### `list` / `ls`

Display upload history.

```bash
pinme list [options]
```

**Options:**
- `-l, --limit <number>`: Limit the number of records displayed
- `-c, --clear`: Clear all upload history

### `set-appkey`

Set AppKey for authentication and automatically merge anonymous upload history to the current account.

```bash
pinme set-appkey [AppKey]
```

**Note:** Domain binding requires authentication and sufficient wallet balance. Get your AppKey from [PinMe website](https://pinme.eth.limo/) or use `pinme login`.

### `login`

Start the browser-based login flow. After login, anonymous upload history is merged into the logged-in account.

```bash
pinme login
pinme login --env test
```

### `show-appkey` / `appkey`

Display current AppKey information with masked sensitive data.

### `logout`

Log out and clear authentication information from local storage.

### `my-domains` / `domain`

List all domains owned by the current account.

### `wallet` / `wallet-balance` / `balance`

Show the current wallet balance for the logged-in account.

```bash
pinme wallet
pinme wallet-balance
pinme balance
```

### `create`

Create a new full-stack project from the PinMe Worker template. This creates the platform Worker/database, downloads the template, installs dependencies, injects API configuration, builds the frontend, uploads it, and writes project settings to `pinme.toml`.

```bash
pinme create [name]
pinme create my-app
pinme create my-app --force
```

**Project layout:**
- `frontend/`: Static frontend application
- `backend/`: Worker backend source and metadata
- `db/`: SQL migration files
- `pinme.toml`: Project name and deployed frontend URL

### `save`

Deploy the current full-stack project from its root directory. It installs dependencies, builds and saves the Worker, applies SQL files from `db/`, builds `frontend/`, uploads `frontend/dist`, and updates `pinme.toml` with the final frontend URL.

```bash
pinme save
pinme save --domain my-site
pinme save --domain example.com
```

### `update-web`

Build and deploy only the frontend from `frontend/`.

```bash
pinme update-web
```

### `update-worker`

Build and deploy only the Worker from `backend/`. SQL files and frontend assets are not processed.

```bash
pinme update-worker
```

### `update-db`

Upload and execute SQL migrations from the `db/` directory. The total SQL payload is limited to 10MB per run.

```bash
pinme update-db
```

### `delete`

Delete a platform project, including Worker, domain binding, and D1 database. Local files are kept unchanged.

```bash
pinme delete
pinme delete my-app
pinme delete my-app --force
```

---

## Wallet Billing

### Overview

PinMe now uses wallet balance for paid capabilities such as domain binding and custom DNS support.

### Domain Binding Requirements

Domain binding (both Pinme subdomains and custom DNS domains) requires sufficient wallet balance.

**Before using domain binding:**

1. **Recharge your wallet**
   - Visit [PinMe website](https://pinme.eth.limo/) to top up your balance

2. **Set AppKey**
   ```bash
   pinme set-appkey <AppKey>
   ```

3. **Bind your domain**
   ```bash
   # Bind to a Pinme subdomain
   pinme upload ./dist --domain my-site

   # Bind to a custom DNS domain
   pinme upload ./dist --domain example.com --dns
   ```

### Checking Wallet Balance

If you attempt to bind a domain without enough balance, you'll see an error message. You can check or recharge your wallet on the [PinMe website](https://pinme.eth.limo/).

---

## Error Handling

### Common Errors and Solutions

#### 1. Node.js Version Too Low
```
Error: Node.js version not supported
```
**Solution:** Upgrade to Node.js 16.13.0 or higher

#### 2. Command Not Found
```
Error: command not found: pinme
```
**Solution:** Run `npm install -g pinme`

#### 3. Folder Does Not Exist
```
Error: No such file or directory
```
**Solution:** Check if path is correct, or use `ls` command to view available directories

#### 4. Permission Error
```
Error: Permission denied
```
**Solution:** Check folder permissions, or use sudo (only when necessary)

#### 5. Upload Failed
- Check network connection
- Confirm file size is within limits (single file 200MB, total directory 1GB)
- Retry upload command

#### 6. Authentication Failed
- Check if AppKey is set correctly
- Confirm AppKey format: `<address>-<jwt>`
- Use `pinme show-appkey` to check current status

---

## Upload Limits

| Type | Free Plan |
|------|-----------|
| Single file | 200MB |
| Total directory | 1GB |

### File Storage

Uploaded files are stored on the IPFS network and accessible through the Glitter Protocol's IPFS gateway.

**After successful upload, you receive:**
1. IPFS content hash
2. Final public URL, selected by priority: DNS domain > Pinme subdomain > short URL > hash preview URL
3. Hash preview fallback: `https://pinme.eth.limo/#/preview/*`

### Log Locations

- Linux/macOS: `~/.pinme/`
- Windows: `%USERPROFILE%\.pinme\`

---

## PinMe Platform Features

### Preview Page
- Access uploaded website via preview link: `https://pinme.eth.limo/#/preview/*`
- Get a Pinme subdomain: `https://<name>.<root-domain>`
- Use a custom DNS domain: `https://<your-domain>`

### Login and Management
- Support browser login and AppKey-based authentication
- View historical upload records
- Manage uploaded files

### Address Binding
- Bind uploads to fixed addresses (requires authentication and wallet balance)
- Convenient for long-term maintenance and access
- Requires `pinme login` or AppKey setup

---

## Usage Tips

### Uploading Vite Projects

When uploading projects built with Vite, ensure proper asset path resolution:

```js
// vite.config.js
export default {
  base: './',
  // other configurations...
};
```

### Working with CAR Files

PinMe supports both importing and exporting CAR (Content Addressable aRchive) files:

#### Importing CAR Files

When using the `import` command for CAR files:

1. **CAR File Format**: Ensure your files have the `.car` extension and follow the IPFS CAR specification
2. **Content Integrity**: CAR files preserve the original content structure and CID relationships
3. **Use Cases**: Ideal for importing previously exported IPFS content, migrating between IPFS nodes, or batch content transfers
4. **Size Considerations**: CAR files can be large, ensure you have sufficient bandwidth and storage space

#### Exporting CAR Files

When using the `export` command:

1. **Export Process**: Export is asynchronous - the command will create an export task and poll for completion
2. **Output Location**: By default, exported CAR files are saved to your system's Downloads directory
3. **Custom Path**: Use `--output` or `-o` to specify a custom output location
4. **CID Format**: Supports CIDv0 (starting with `Qm`) and CIDv1 (starting with `bafy`, `bafk`, or `bafz`)
5. **Use Cases**: Backup IPFS content, migrate content between nodes, or archive specific IPFS content

#### CAR File Workflow

```bash
# Export IPFS content to CAR file
pinme export <CID>

# Later, import the CAR file back to IPFS
pinme import ~/Downloads/<CID>.car
```

### Best Practices

1. **Pre-upload Checks**
   - Confirm build process completed
   - Verify output directory exists and contains expected files

2. **Security**
   - Do not upload sensitive information
   - Avoid uploading development config files

3. **Performance Optimization**
   - Compress images and resource files
   - Remove unnecessary files

4. **Verify Deployment**
   - Test if preview page is accessible after upload
   - Check if website functions normally
   - **Ensure router is configured to use hash mode** (e.g., `/#/path` instead of `/path`)

---

## GitHub Actions Integration

PinMe can be integrated with GitHub Actions for automated CI/CD deployment.

### Quick Setup

1. **Add workflow file** to your repository:
   - Create `.github/workflows/deploy.yml`

2. **Configure GitHub Secrets:**
   - Go to repository → Settings → Secrets and variables → Actions
   - Add `PINME_APPKEY` with your PinMe AppKey
   - (Optional) Add `PINME_DOMAIN` for custom domain

3. **Push to trigger deployment:**
   - Push to `main` or `master` branch
   - Or manually trigger via Actions tab

### Example Workflow

```yaml
name: Deploy to PinMe

on:
  push:
    branches: [main, master]
  workflow_dispatch:
    inputs:
      domain:
        description: 'PinMe domain name'
        required: true
      build_dir:
        description: 'Build directory'
        default: 'dist'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm install -g pinme
      - run: pinme set-appkey "${{ secrets.PINME_APPKEY }}"
      - run: pinme upload dist --domain "${{ secrets.PINME_DOMAIN }}"
```

`pinme set-appkey` satisfies the authentication requirement for `pinme upload` in CI.

### Supported Build Tools

- **Vite**: Builds to `dist/`
- **Create React App**: Builds to `build/`
- **Next.js**: Builds to `out/` (with `output: 'export'`)
- **Vue CLI**: Builds to `dist/`
- **Angular**: Builds to `dist/`
- **Static sites**: Uses root directory or `public/`

### Troubleshooting GitHub Actions

**Build directory not found:**
- Ensure build script outputs to standard directory
- Use manual workflow dispatch to specify custom directory

**Authentication failed:**
- Verify `PINME_APPKEY` secret is correct
- Ensure AppKey format: `<address>-<jwt>`

**Domain binding failed:**
- Check if domain name is available
- Ensure you have permission to bind the domain

---

## License

MIT License - See the [LICENSE](LICENSE) file for details

---

## Contact Us

If you have questions or suggestions, please contact us through:

- GitHub Issues: [https://github.com/glitternetwork/pinme/issues](https://github.com/glitternetwork/pinme/issues)
- Email: [pinme@glitterprotocol.io](mailto:pinme@glitterprotocol.io)
- Website: [https://pinme.eth.limo/](https://pinme.eth.limo/)

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=glitternetwork/pinme&type=Date)](https://star-history.com/#glitternetwork/pinme&Date)

---

Developed and maintained by the [Glitter Protocol](https://glitterprotocol.io/) team
