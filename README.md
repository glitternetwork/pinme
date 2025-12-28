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
No servers. No accounts. No setup.

Build a static site, generate a page with AI, or export your frontend — then deploy instantly with a single command.

PinMe publishes your site as verifiable content, making silent tampering and accidental breakage far harder than traditional hosting.

You don’t manage servers, regions, or uptime.
PinMe handles availability and persistence for you.

Website: [https://pinme.eth.limo/](https://pinme.eth.limo/)

## Installation

### Using npm

```bash
npm install -g pinme
```

### Using yarn

```bash
yarn global add pinme
```

## Usage

### Upload files or directories

```bash
# Interactive upload
pinme upload

# Specify path directly
pinme upload /path/to/file-or-directory

# Upload and bind to a domain
pinme upload /path/to/file-or-directory --domain <name>
pinme upload /path/to/file-or-directory -d <name>
```

### Remove files from IPFS

```bash
# Interactive removal
pinme rm

# Remove a specific file by hash
pinme rm <IPFS_hash>
```

### View upload history

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

### Set AppKey for authentication

```bash
# Interactive AppKey setup
pinme set-appkey

# Set AppKey directly
pinme set-appkey <AppKey>
```

### View AppKey information

```bash
# Show current AppKey (masked for security)
pinme show-appkey

# Or use the shorthand command
pinme appkey
```

### Log out

```bash
# Log out and clear authentication
pinme logout
```

### View your domains

```bash
# List all domains owned by current account
pinme my-domains

# Or use the shorthand command
pinme domain
```

### Get help

```bash
# Display help information
pinme help
```

## Command Details

### `upload`

Upload a file or directory to the IPFS network. Supports binding to a Pinme subdomain after upload.

```bash
pinme upload [path] [--domain <name>]
```

**Options:**

- `path`: Path to the file or directory to upload (optional, if not provided, interactive mode will be entered)
- `-d, --domain <name>`: Pinme subdomain to bind after upload (optional)

**Examples:**

```bash
# Interactive upload
pinme upload

# Upload a specific file
pinme upload ./example.jpg

# Upload an entire directory
pinme upload ./my-website

# Upload and bind to a domain
pinme upload ./my-website --domain my-site
pinme upload ./my-website -d my-site
```

### `rm`

Remove a file from the IPFS network.

```bash
pinme rm [hash]
```

**Options:**

- `hash`: IPFS content hash to remove (optional, if not provided, interactive mode will be entered)

**Examples:**

```bash
# Interactive removal
pinme rm

# Remove a specific file by hash
pinme rm bafybeifdwyoz66u5czbbjvmmais5fzrzrolxbyiydqsbrxessndt3s6zdi
```

**Note:** This action unpins the content from our IPFS node and deletes the ENS subdomain record. It does not ensure that the file is removed from the IPFS network.

### `list` / `ls`

Display upload history.

```bash
pinme list [options]
pinme ls [options]
```

**Options:**

- `-l, --limit <number>`: Limit the number of records displayed
- `-c, --clear`: Clear all upload history

**Examples:**

```bash
# Show the last 10 records
pinme list

# Show the last 5 records
pinme ls -l 5

# Clear all history records
pinme list -c
```

### `set-appkey`

Set AppKey for authentication and automatically merge anonymous upload history to the current account.

```bash
pinme set-appkey [AppKey]
```

**Options:**

- `AppKey`: Your AppKey for authentication (optional, if not provided, interactive mode will be entered)

**Examples:**

```bash
# Interactive AppKey setup
pinme set-appkey

# Set AppKey directly
pinme set-appkey your-app-key-here
```

**Note:** After setting the AppKey, your anonymous upload history will be automatically merged to your account.

### `show-appkey` / `appkey`

Display current AppKey information with masked sensitive data.

```bash
pinme show-appkey
pinme appkey
```

**Description:**

This command shows the current AppKey information including:
- Address (fully displayed)
- Token (masked for security)
- AppKey (masked for security)

**Examples:**

```bash
# Show AppKey information
pinme show-appkey

# Shorthand command
pinme appkey
```

**Note:** Sensitive information (token and AppKey) will be masked to protect your credentials. Only the address is fully displayed.

### `logout`

Log out and clear authentication information from local storage.

```bash
pinme logout
```

**Description:**

This command logs out the current user and removes the authentication information from local storage. After logging out, you will need to set your AppKey again to use authenticated features.

**Examples:**

```bash
# Log out
pinme logout
```

**Note:** This action will remove your AppKey from local storage. You can set it again using `pinme set-appkey` command.

### `my-domains` / `domain`

List all domains owned by the current account.

```bash
pinme my-domains
pinme domain
```

**Examples:**

```bash
# List all domains
pinme my-domains

# Shorthand command
pinme domain
```

This command displays information about each domain including:

- Domain name
- Domain type
- Bind time
- Expire time

### `help`

Display help information.

```bash
pinme help [command]
```

**Options:**

- `command`: The specific command to view help for (optional)

**Examples:**

```bash
# Display general help
pinme help
```

## Upload Limits

- Single file size limit: 200MB (free plan)
- Total directory size limit: 1GB (free plan)

## File Storage

Uploaded files are stored on the IPFS network and accessible through the Glitter Protocol's IPFS gateway. After a successful upload, you will receive:

1. IPFS content hash
2. Accessible URL link

### Log Locations

Logs and configuration files are stored in:

- Linux/macOS: `~/.pinme/`
- Windows: `%USERPROFILE%\.pinme\`

## License

MIT License - See the [LICENSE](LICENSE) file for details

## Usage Tips

### Uploading Vite Projects

When uploading projects built with Vite, please note:

1. **Vite Configuration**: Add `base: "./"` to your Vite configuration file to ensure proper asset path resolution:

```js
// vite.config.js
export default {
  base: './',
  // other configurations...
};
```

## GitHub Actions Integration

PinMe can be integrated with GitHub Actions to automatically deploy your project when you push code to GitHub. This enables a fully automated CI/CD workflow.

### Quick Setup

1. **Add the workflow file** to your repository:

   - Copy `.github/workflows/deploy.yml` from the PinMe repository to your project
   - Or create `.github/workflows/deploy.yml` in your repository

2. **Configure GitHub Secrets**:

   - Go to your repository → Settings → Secrets and variables → Actions
   - Add a new secret named `PINME_APPKEY` with your PinMe AppKey
   - (Optional) Add `PINME_DOMAIN` to specify a custom domain name

3. **Push to trigger deployment**:
   - Push code to `main` or `master` branch to trigger automatic deployment
   - Or manually trigger via Actions tab → "Deploy to PinMe" → Run workflow

### Workflow Features

The GitHub Actions workflow automatically:

- ✅ Detects and installs project dependencies
- ✅ Builds your project (if a build script exists)
- ✅ Installs PinMe CLI
- ✅ Sets up authentication using your AppKey
- ✅ Auto-detects build output directory (`dist`, `build`, `public`, or `out`)
- ✅ Uploads to IPFS and binds to your domain
- ✅ Provides deployment summary with access URL

### Configuration Options

#### Using GitHub Secrets

You can configure the following secrets in your repository:

- **`PINME_APPKEY`** (Required): Your PinMe AppKey for authentication

  - Format: `<address>-<jwt>`
  - Get your AppKey from [PinMe website](https://pinme.eth.limo/)

- **`PINME_DOMAIN`** (Optional): Default domain name to bind
  - If not set, the workflow will generate a domain from your repository name
  - Example: `my-awesome-project` → `https://my-awesome-project.pinit.eth.limo`

#### Manual Workflow Dispatch

You can also manually trigger the workflow with custom parameters:

1. Go to Actions tab in your repository
2. Select "Deploy to PinMe" workflow
3. Click "Run workflow"
4. Enter:
   - **Domain**: Your desired PinMe domain name
   - **Build Directory**: Your build output directory (default: `dist`)

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

### Supported Build Tools

The workflow automatically detects and supports:

- **Vite**: Builds to `dist/`
- **Create React App**: Builds to `build/`
- **Next.js**: Builds to `out/` (with `output: 'export'`)
- **Vue CLI**: Builds to `dist/`
- **Angular**: Builds to `dist/`
- **Static sites**: Uses root directory or `public/`

### Troubleshooting

**Build directory not found:**

- Ensure your build script outputs to a standard directory (`dist`, `build`, `public`, or `out`)
- Or set `PINME_DOMAIN` secret and use manual workflow dispatch to specify custom directory

**Authentication failed:**

- Verify your `PINME_APPKEY` secret is correctly set
- Ensure the AppKey format is correct: `<address>-<jwt>`

**Domain binding failed:**

- Check if the domain name is available
- Ensure you have permission to bind the domain
- Try a different domain name

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=glitternetwork/pinme&type=Date)](https://star-history.com/#glitternetwork/pinme&Date)

## Contact Us

If you have questions or suggestions, please contact us through:

- GitHub Issues: [https://github.com/glitternetwork/pinme/issues](https://github.com/glitternetwork/pinme/issues)
- Email: [pinme@glitterprotocol.io](mailto:pinme@glitterprotocol.io)

---

Developed and maintained by the [Glitter Protocol](https://glitterprotocol.io/) team
