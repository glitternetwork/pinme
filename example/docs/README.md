# PinMe

[PinMe](https://pinme.eth.limo/) is a simple and easy-to-use command-line tool for uploading files and directories to the [IPFS](https://ipfs.tech/) network.

Website: [https://pinme.eth.limo/](https://pinme.eth.limo/)

## Features

- Simple and intuitive command-line interface
- Fast uploading of files and directories to IPFS
- Automatic generation and display of access links
- Built-in Pinning service integration for persistent content
- Support for various configuration options

## Installing PinMe

```bash
npm install -g pinme
# or
yarn global add pinme
```

# PinMe Documentation Project

This is the official documentation project for the PinMe tool, containing detailed user guides, API references, and best practices.

## Documentation Structure

```
./
├── guide/        # User guide directory
├── api/          # API reference documentation
├── examples/     # Example code and use cases
├── images/       # Documentation image resources
└── index.md      # Documentation homepage
```

## Local Preview

You can preview the documentation using any static web server:

```bash
# Using Python's simple HTTP server
python -m http.server

# Or using Node.js http-server
npx http-server ./
```

## Deploy Documentation to IPFS

```bash
# Upload the entire documentation directory to IPFS
pinme upload ./
```

## After Deployment

After successful deployment, PinMe will output the CID and access links. You can access the documentation via:

- IPFS Gateway: `https://ipfs.io/ipfs/<your-CID>`

## Updating Documentation

1. Modify the relevant Markdown files
2. Redeploy to IPFS
3. Update DNSLink to point to the new CID (if using a custom domain)

## Contributing to Documentation

We welcome community contributions to the documentation:

1. Fork this repository
2. Create your feature branch (`git checkout -b feature/amazing-doc`)
3. Commit your changes (`git commit -m 'Add some amazing doc'`)
4. Push to the branch (`git push origin feature/amazing-doc`)
5. Open a Pull Request

## License

MIT

```bash
pinme upload ./
```
