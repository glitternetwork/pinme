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

// upload command help
function showUploadHelp(): void {
  console.log("COMMAND:");
  console.log("  upload - Upload a file or directory to IPFS\n");
  
  console.log("USAGE:");
  console.log("  pinme upload [path]\n");
  
  console.log("DESCRIPTION:");
  console.log("  This command uploads files or directories to IPFS.");
  console.log("  If no path is provided, it will start in interactive mode.\n");
  
  console.log("EXAMPLES:");
  console.log("  pinme upload");
  console.log("  pinme upload ./my-website\n");
  
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