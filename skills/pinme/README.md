# PinMe

A Claude Code skill for deploying static websites to IPFS using PinMe CLI.

## Features

- Automatically detects build output directories (`dist/`, `build/`, `out/`, `public/`)
- Validates static file structure before upload
- Uploads to IPFS and returns a preview URL
- Supports all major frontend frameworks (Vue, React, Next.js, Vite, etc.)

## Prerequisites

Install PinMe CLI:

```bash
npm install -g pinme
```

## Installation

### From GitHub

```bash
# Clone the repository
git clone https://github.com/glitternetwork/skills.git

# Copy to Claude Code skills directory
cp -r skills/pinme ~/.claude/skills/
```

### Manual Installation

Copy the skill folder to `~/.claude/skills/pinme/`

## Usage

After building your frontend project, simply ask Claude:

- "Deploy this website"
- "Upload to pinme"
- "Publish this frontend project"

Claude will automatically:

1. Check if PinMe is installed
2. Find your build output directory
3. Verify it contains `index.html`
4. Upload to IPFS
5. Return the preview URL

## Example Workflow

```bash
# Build your project
npm run build

# Ask Claude to deploy
> Deploy the dist folder
```

Result:
```
https://pinme.eth.limo/#/preview/<hash>
```

Visit the preview page to get a fixed domain: `https://<name>.pinit.eth.limo`

## Supported Frameworks

| Framework | Build Command | Output Directory |
|-----------|--------------|------------------|
| Vue/Vite | `npm run build` | `dist/` |
| React (CRA) | `npm run build` | `build/` |
| Next.js | `npm run build && npm run export` | `out/` |
| Static | - | `public/` |

## License

MIT
