import chalk from 'chalk';
import figlet from 'figlet';

// show ASCII art banner
function showBanner(): void {
  console.log(
    chalk.cyan(
      figlet.textSync("Pinme CLI", { horizontalLayout: "full" })
    )
  );
  console.log(chalk.cyan("A command-line tool for uploading files to IPFS\n"));
}

// general help
function showGeneralHelp(): void {
  showBanner();

  console.log("USAGE:");
  console.log("  pinme [command] [options]\n");

  console.log("COMMANDS:");
  console.log("  upload              Upload a file or directory to IPFS");
  console.log("  bind                Upload and bind to a domain (requires VIP)");
  console.log("  list                Show upload history");
  console.log("  ls                  Alias for 'list' command");
  console.log("  set-appkey          Set AppKey for authentication");
  console.log("  show-appkey         Show current AppKey information (masked)");
  console.log("  appkey              Alias for 'show-appkey' command");
  console.log("  logout              Log out and clear authentication");
  console.log("  help [command]      Show help for a specific command\n");

  console.log("OPTIONS:");
  console.log("  -v, --version       Output the current version");
  console.log("  -h, --help          Display help for command\n");

  console.log("For more information on a specific command, try:");
  console.log("  pinme help [command]");
}

// bind command help
function showBindHelp(): void {
  console.log("COMMAND:");
  console.log("  bind - Upload and bind to a domain (requires VIP)\n");

  console.log("USAGE:");
  console.log("  pinme bind <path> [options]\n");

  console.log("DESCRIPTION:");
  console.log("  This command uploads files and binds them to a custom domain.");
  console.log("  Domain binding requires VIP membership.\n");

  console.log("OPTIONS:");
  console.log("  -d, --domain <name>  Domain name to bind (required)");
  console.log("  --dns                Force DNS domain mode (optional, auto-detected)\n");

  console.log("EXAMPLES:");
  console.log("  # Interactive mode (will prompt for path and domain)");
  console.log("  pinme bind\n");
  console.log("  # Bind to a Pinme subdomain (auto-detected: no dot in domain)");
  console.log("  pinme bind ./dist --domain my-site\n");
  console.log("  # Bind to a DNS domain (auto-detected: contains dot)");
  console.log("  pinme bind ./dist --domain example.com\n");
  console.log("  # Force DNS mode with --dns flag");
  console.log("  pinme bind ./dist --domain my-site --dns\n");

  console.log("AUTO-DETECTION:");
  console.log("  - Domains with a dot (e.g., example.com) are treated as DNS domains");
  console.log("  - Domains without a dot (e.g., my-site) are treated as Pinme subdomains");
  console.log("  - Use --dns flag to force DNS domain mode\n");

  console.log("REQUIREMENTS:");
  console.log("  - VIP membership required for all domain binding");
  console.log("  - Valid AppKey must be set (run: pinme set-appkey <AppKey>)");
  console.log("  - For DNS domains, you must own the domain\n");

  console.log("URL FORMATS:");
  console.log("  - Pinme subdomain: https://<name>.pinit.eth.limo");
  console.log("  - DNS domain: https://<your-domain>.com\n");

  console.log("DNS SETUP:");
  console.log("  After successful DNS binding, visit:");
  console.log("  https://pinme.eth.limo/#/docs?id=custom-domain");
  console.log("  for DNS configuration guide.\n");
}

// upload command help
function showUploadHelp(): void {
  console.log("COMMAND:");
  console.log("  upload - Upload a file or directory to IPFS\n");

  console.log("USAGE:");
  console.log("  pinme upload [path] [options]\n");

  console.log("DESCRIPTION:");
  console.log("  This command uploads files or directories to IPFS.");
  console.log("  If no path is provided, it will start in interactive mode.");
  console.log("  Supports --domain option to bind a custom domain after upload (requires VIP).\n");

  console.log("OPTIONS:");
  console.log("  -d, --domain <name>  Domain name to bind (optional, requires VIP)");
  console.log("  --dns                Force DNS domain mode (optional, auto-detected)\n");

  console.log("EXAMPLES:");
  console.log("  # Upload without binding");
  console.log("  pinme upload");
  console.log("  pinme upload ./my-website\n");
  console.log("  # Upload and bind to a Pinme subdomain (auto-detected: no dot)");
  console.log("  pinme upload ./dist --domain my-site\n");
  console.log("  # Upload and bind to a DNS domain (auto-detected: contains dot)");
  console.log("  pinme upload ./dist --domain example.com\n");
  console.log("  # Force DNS mode with --dns flag");
  console.log("  pinme upload ./dist --domain my-site --dns\n");

  console.log("AUTO-DETECTION:");
  console.log("  - Domains with a dot (e.g., example.com) are treated as DNS domains");
  console.log("  - Domains without a dot (e.g., my-site) are treated as Pinme subdomains");
  console.log("  - Use --dns flag to force DNS domain mode\n");

  console.log("REQUIREMENTS:");
  console.log("  - VIP membership required for domain binding");
  console.log("  - Valid AppKey must be set (run: pinme set-appkey <AppKey>)");
  console.log("  - For DNS domains, you must own the domain\n");

  console.log("LIMITATIONS:");
  console.log("  - Maximum file size: 10MB");
  console.log("  - Maximum directory size: 500MB");
}

// list command help
function showListHelp(): void {
  console.log("COMMAND:");
  console.log("  list - Show upload history\n");

  console.log("USAGE:");
  console.log("  pinme list [options]\n");

  console.log("OPTIONS:");
  console.log("  -l, --limit <number>   Limit the number of records to show");
  console.log("  -c, --clear            Clear all upload history\n");

  console.log("EXAMPLES:");
  console.log("  pinme list");
  console.log("  pinme list -l 5");
  console.log("  pinme list -c");
}

// ls command help (can reuse the list command help)
function showLsHelp(): void {
  console.log("COMMAND:");
  console.log("  ls - Alias for 'list' command\n");

  console.log("USAGE:");
  console.log("  pinme ls [options]\n");

  console.log("OPTIONS:");
  console.log("  -l, --limit <number>   Limit the number of records to show");
  console.log("  -c, --clear            Clear all upload history\n");

  console.log("EXAMPLES:");
  console.log("  pinme ls");
  console.log("  pinme ls -l 5");
  console.log("  pinme ls -c");
}

// show-appkey command help
function showShowAppKeyHelp(): void {
  console.log("COMMAND:");
  console.log("  show-appkey - Show current AppKey information (masked)\n");

  console.log("USAGE:");
  console.log("  pinme show-appkey");
  console.log("  pinme appkey\n");

  console.log("DESCRIPTION:");
  console.log("  This command displays the current AppKey information.");
  console.log("  Sensitive information (token and AppKey) will be masked for security.\n");

  console.log("EXAMPLES:");
  console.log("  pinme show-appkey");
  console.log("  pinme appkey");
}

// logout command help
function showLogoutHelp(): void {
  console.log("COMMAND:");
  console.log("  logout - Log out and clear authentication\n");

  console.log("USAGE:");
  console.log("  pinme logout\n");

  console.log("DESCRIPTION:");
  console.log("  This command logs out the current user and clears the authentication");
  console.log("  information from local storage. You will need to set AppKey again");
  console.log("  to use authenticated features.\n");

  console.log("EXAMPLES:");
  console.log("  pinme logout");
}

// show the help for the command
function showHelp(command?: string): void {
  if (!command) {
    showGeneralHelp();
    return;
  }

  switch (command) {
    case 'bind':
      showBindHelp();
      break;
    case 'upload':
      showUploadHelp();
      break;
    case 'list':
      showListHelp();
      break;
    case 'ls':
      showLsHelp();
      break;
    case 'show-appkey':
    case 'appkey':
      showShowAppKeyHelp();
      break;
    case 'logout':
      showLogoutHelp();
      break;
    default:
      console.log(`Unknown command: ${command}`);
      showGeneralHelp();
  }
}

export {
  showHelp,
  showBanner
};
