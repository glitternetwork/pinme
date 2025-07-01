# Quick Start

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

### Get help

```bash
# Display help information
pinme help
```
