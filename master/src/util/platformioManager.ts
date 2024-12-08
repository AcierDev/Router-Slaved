import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import chalk from "chalk";
import fs from "fs/promises";

const execAsync = promisify(exec);

export class PlatformIOManager {
  private slavePath: string;
  private maxRetries: number = 3;
  private uploadBaudRate: number = 115200; // Start with a lower baud rate
  private platformioConfigPath: string;

  constructor(slavePath: string) {
    this.slavePath = slavePath;
    this.platformioConfigPath = path.join(slavePath, "platformio.ini");
  }

  private async updateUploadSpeed(speed: number): Promise<void> {
    try {
      let config = await fs.readFile(this.platformioConfigPath, "utf8");

      // Check if upload_speed already exists
      if (config.includes("upload_speed")) {
        // Replace existing upload_speed
        config = config.replace(
          /upload_speed\s*=\s*\d+/,
          `upload_speed = ${speed}`
        );
      } else {
        // Add upload_speed to [env:esp32] section
        config = config.replace(
          /\[env:esp32\]/,
          `[env:esp32]\nupload_speed = ${speed}`
        );
      }

      await fs.writeFile(this.platformioConfigPath, config);
      console.log(
        chalk.cyan(`Updated upload speed to ${speed} in platformio.ini`)
      );
    } catch (error) {
      console.error(chalk.red("Error updating platformio.ini:"), error);
      throw error;
    }
  }

  async uploadCode(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(
          chalk.cyan(`Upload attempt ${attempt}/${this.maxRetries}...`)
        );

        // Update upload speed in platformio.ini
        await this.updateUploadSpeed(this.uploadBaudRate);

        // First, build the code
        console.log(chalk.cyan("Building slave code..."));
        const buildResult = await execAsync("pio run", {
          cwd: this.slavePath,
        });

        if (buildResult.stderr && !buildResult.stderr.includes("Success")) {
          console.error(chalk.red("Error building code:"), buildResult.stderr);
          continue;
        }

        // Then upload with the current baud rate
        console.log(
          chalk.cyan(`Uploading with baud rate ${this.uploadBaudRate}...`)
        );
        const { stdout, stderr } = await execAsync(
          "pio run -t upload --upload-port /dev/cu.usbserial-210",
          {
            cwd: this.slavePath,
          }
        );

        if (stderr && !stderr.includes("Success")) {
          if (stderr.includes("Unable to verify flash chip connection")) {
            // If we get a connection error, reduce baud rate for next attempt
            this.uploadBaudRate = Math.max(9600, this.uploadBaudRate / 2);
            console.log(
              chalk.yellow(
                `Reducing baud rate to ${this.uploadBaudRate} for next attempt`
              )
            );
            continue;
          }
          console.error(chalk.red("Error uploading code:"), stderr);
          continue;
        }

        console.log(chalk.green("✓ Code uploaded successfully"));
        return true;
      } catch (error) {
        console.error(
          chalk.red(`Upload attempt ${attempt} failed:`),
          error instanceof Error ? error.message : String(error)
        );

        if (attempt === this.maxRetries) {
          console.error(chalk.red("All upload attempts failed"));
          return false;
        }

        // Wait before next attempt
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return false;
  }

  async verifyPlatformIO(): Promise<boolean> {
    try {
      const { stdout } = await execAsync("pio --version");
      console.log(chalk.green(`✓ PlatformIO version: ${stdout.trim()}`));
      return true;
    } catch (error) {
      console.error(
        chalk.red("✗ PlatformIO CLI not found. Please install it first.")
      );
      return false;
    }
  }
}
