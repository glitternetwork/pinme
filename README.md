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

[PinMe](https://pinme.eth.limo/) is a one-command deploy tool that turns static sites into permanent, verifiable frontends by pinning to [IPFS](https://ipfs.tech/), writing contenthash to [ENS](https://ens.domains/) subnames, and serving through gateways like [eth.limo](https://eth.limo/)—no DNS, no servers.

Website：[https://pinme.eth.limo/](https://pinme.eth.limo/)


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

## Command Details

### `upload`

Upload a file or directory to the IPFS network.

```bash
pinme upload [path]
```

**Options:**
- `path`: Path to the file or directory to upload (optional, if not provided, interactive mode will be entered)

**Examples:**
```bash
# Interactive upload
pinme upload

# Upload a specific file
pinme upload ./example.jpg

# Upload an entire directory
pinme upload ./my-website
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

- Single file size limit: 20MB
- Total directory size limit: 500MB

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
  base: "./",
  // other configurations...
}
```

## Contact Us

If you have questions or suggestions, please contact us through:

- GitHub Issues: [https://github.com/glitternetwork/pinme/issues](https://github.com/glitternetwork/pinme/issue)
- Email: [pinme@glitterprotocol.io](mailto:pinme@glitterprotocol.io)

---

Developed and maintained by the [Glitter Protocol](https://glitterprotocol.io/) team
