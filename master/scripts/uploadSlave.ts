import { PlatformIOManager } from "../src/util/platformioManager.js";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import chalk from "chalk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const verifyOnly = process.argv.includes("--verify-only");
  const slavePath = path.join(__dirname, "../../../slave");
  const platformIO = new PlatformIOManager(slavePath);

  try {
    if (!(await platformIO.verifyPlatformIO())) {
      throw new Error("PlatformIO CLI is required but not found");
    }

    if (verifyOnly) {
      console.log(chalk.green("✓ PlatformIO verification successful"));
      process.exit(0);
    }

    const uploaded = await platformIO.uploadCode();
    if (!uploaded) {
      throw new Error("Failed to upload slave code");
    }

    console.log(chalk.green("✓ Slave code uploaded successfully"));
    process.exit(0);
  } catch (error) {
    console.error(chalk.red("Error:"), error);
    process.exit(1);
  }
}

main();
