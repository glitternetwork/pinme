---
name: pinme
version: 1.0.0
description: This skill should be used when the user asks to "deploy", "upload", "publish", or "pin" any files, folders, frontend projects, or static websites to IPFS. Also activates when user mentions "pinme", "IPFS", or wants to share files via decentralized storage.
author:
  name: glitternetwork
  url: https://github.com/glitternetwork
homepage: https://github.com/glitternetwork/skills/tree/main/pinme
repository: https://github.com/glitternetwork/skills
license: MIT
keywords:
  - deploy
  - ipfs
  - upload
  - files
  - pinme
  - hosting
  - frontend
  - web3
  - storage
---

# PinMe Skill

Use PinMe CLI to upload files and get a preview URL.

## When to Use

### General File Upload
- User wants to upload any files or folders to IPFS
- User wants to share files via decentralized storage
- User mentions "pinme", "pin", "IPFS", or "upload to IPFS"

### Website Deployment
- User requests deployment of a frontend project
- User wants to deploy a static website
- After building a frontend project (Vue, React, Next.js, etc.)

## Upload Steps

### 1. Check if PinMe is Installed

```bash
pinme --version
```

If not installed:
```bash
npm install -g pinme
```

### 2. Identify Upload Target

**For general files:**
- Use the file or directory path specified by the user
- Can be any file type: images, documents, archives, etc.

**For website deployment:**
Look for build output directories (in priority order):
1. `dist/` - Vue/React/Vite default output
2. `build/` - Create React App output
3. `out/` - Next.js static export
4. `public/` - Pure static projects

### 3. Execute Upload

```bash
pinme upload <path>
```

Examples:
```bash
# Upload a single file
pinme upload ./document.pdf

# Upload a folder
pinme upload ./my-folder

# Upload website build output
pinme upload dist
```

### 4. Return Result

After successful upload, return the preview URL:
```
https://pinme.eth.limo/#/preview/<hash>
```

Users can visit the preview page to:
- View or download the uploaded files
- Get a fixed domain: `https://<name>.pinit.eth.limo`

## Router Mode Check

Before building a frontend project for IPFS deployment, ensure it uses **hash mode** routing (e.g., `/#/about`). History mode (e.g., `/about`) will cause **404 errors** on sub-routes when deployed to IPFS, because there is no server to handle fallback routing.

- **React**: Use `HashRouter` instead of `BrowserRouter`
- **Vue**: Use `createWebHashHistory()` instead of `createWebHistory()`

## Important Rules

**DO:**
- Verify the file or directory exists before uploading
- Return the preview URL to the user

**DO NOT:**
- Upload `node_modules/`
- Upload `.env` files
- Upload `.git/` directory
- Upload empty or non-existent paths

**For website deployment, also avoid:**
- Uploading source code instead of build output
- Uploading configuration files (package.json, tsconfig.json, etc.)

## Common Workflows

### General File Upload

```bash
# Upload a single file
pinme upload ./image.png

# Upload a folder
pinme upload ./my-documents

# Upload with specific path
pinme upload /path/to/files
```

### Website Deployment

#### Vue/Vite
```bash
npm run build
pinme upload dist
```

#### React CRA
```bash
npm run build
pinme upload build
```

#### Next.js Static
```bash
npm run build
npm run export  # or next export
pinme upload out
```

## Error Handling

| Error | Solution |
|-------|----------|
| `command not found: pinme` | Run `npm install -g pinme` |
| `No such file or directory` | Check path exists |
| `Permission denied` | Check file/folder permissions |
| Upload failed | Check network, retry |

## Other Commands

```bash
# List upload history
pinme list
pinme ls -l 5

# Remove uploaded file
pinme rm <hash>
```
