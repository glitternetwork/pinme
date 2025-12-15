import fs from 'fs';
import path from 'path';
import Inquirer from "inquirer";

// Check if the path exists and return the absolute path
function checkPath(inputPath: string): string | null {
  try {
    // Convert to absolute path
    const absolutePath = path.resolve(inputPath);
    
    // Check if the path exists
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
    return null;
  } catch (error: any) {
    console.error(`Error checking path: ${error.message}`);
    return null;
  }
}

export default async function(projectName: string): Promise<boolean> {
  // Get the current working directory
  const cwd = process.cwd();  
  // Get the project directory
  const targetDirectory = path.join(cwd, projectName);
  // Check if the directory exists
  if (fs.existsSync(targetDirectory)) {
    let { isOverwrite } = await Inquirer.prompt([
      {
        name: "isOverwrite", // Corresponding to the return value
        type: "list", // List type
        message: "Target directory exists, Please choose an action",
        choices: [
          { name: "Overwrite", value: true },
          { name: "Cancel", value: false },
        ],
      },
    ]);
    // Choose Cancel
    if (!isOverwrite) {
      console.log("\n Canceled \n");
      return false;
    } else {
      // Choose Overwrite, delete the existing directory
      console.log("Removing folder...");
      await fs.promises.rm(targetDirectory, { recursive: true, force: true });
      console.log("Folder removed!");
      return true
    }
  } else {
    return true;
  }
}; 