# PinMe

A Claude Code skill for uploading files to IPFS using PinMe CLI.

## Features

- Upload any files or folders to IPFS
- Automatically detects build output directories for website deployment (`dist/`, `build/`, `out/`, `public/`)
- Returns a preview URL for easy sharing
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

### General File Upload

Upload any files or folders to IPFS:

- "Upload this file to IPFS"
- "Pin this folder"
- "Upload ./my-documents to pinme"

### Website Deployment

After building your frontend project:

- "Deploy this website"
- "Upload to pinme"
- "Publish this frontend project"

### What Claude Does

1. Check if PinMe is installed
2. Identify the upload target
3. Upload to IPFS
4. Return the preview URL

## Example Workflows

### Upload Files

```bash
# Ask Claude to upload
> Upload ./my-documents to IPFS
```

### Deploy Website

```bash
# Build your project
npm run build

# Ask Claude to deploy
> Deploy the dist folder
```

### Result

```
https://pinme.eth.limo/#/preview/<hash>
```

Visit the preview page to:
- View or download uploaded files
- Get a fixed domain: `https://<name>.pinit.eth.limo`

## Supported Frameworks

| Framework | Build Command | Output Directory |
|-----------|--------------|------------------|
| Vue/Vite | `npm run build` | `dist/` |
| React (CRA) | `npm run build` | `build/` |
| Next.js | `npm run build && npm run export` | `out/` |
| Static | - | `public/` |

## License

MIT
