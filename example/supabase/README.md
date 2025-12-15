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

Before using this deployment blog, please install the PinMe tool:

```bash
npm install -g pinme
# or
yarn global add pinme
```

# PinMe Deploy Blog

This is a Supabase-based blog project that can be easily deployed to the IPFS network.

## Project Structure

```
./
├── src/           # Source code directory
├── public/        # Static assets directory
├── components/    # Components directory
└── dist/          # Build output directory
```

## Installation
```bash
pnpm install
```

## Local Preview
```bash
pnpm run dev
```

## Build Project
```bash
pnpm run build
``` 

## Deploy to IPFS
```bash
pinme upload ./dist
```

## After Deployment

After successful deployment, PinMe will output the CID and access links. You can access your blog via:

- IPFS Gateway: `https://ipfs.glitterprotocol.dev/ipfs/<your-CID>`
- PinMe Gateway: `https://pinme.dev/ipfs/<your-CID>`
- Or set up a custom domain (see PinMe documentation)

## Contributing

Issues and Pull Requests are welcome to help improve this project.

## License

MIT
