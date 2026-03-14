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

# PinMe Deploy Blog

This is a Hugo-based static blog project that can be easily deployed to the IPFS network.

## Project Structure

```
./
├── content/      # Blog content directory
├── themes/       # Hugo themes directory
├── layouts/      # Custom layouts directory
├── static/       # Static assets directory
└── public/       # Build output directory
```

## Prerequisites

- [Hugo](https://gohugo.io/) (Static site generator) installed
- PinMe tool installed

## Local Preview

```bash
# Start Hugo server for local preview
hugo server -D
```

## Build and Deploy

```bash
# Build the static site
hugo

# Upload the built site to IPFS
pinme upload ./public
```

## After Deployment

After successful deployment, PinMe will output the CID and access links. You can access your blog via:

- IPFS Gateway: `https://ipfs.io/ipfs/<your-CID>`
- Or set up a custom domain

## Custom Domain

To access your blog with a custom domain, refer to the DNSLink setup guide in the PinMe documentation.

## Contributing

Issues and Pull Requests are welcome to help improve this project.

## License

MIT

```bash
hugo build 
pinme upload ./public
```
