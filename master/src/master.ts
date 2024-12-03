import { SerialCommunication } from "./serialCommunication.js";
import { SettingsManager } from "./settings/settings.js";
import {
  Command,
  RouterState,
  SlaveSettings,
  SlaveState,
} from "./typings/types.js";
import { WebSocketServer } from "./websocketServer.js";
import readline from "readline";
import chalk from "chalk";
import { AndroidController } from "./android/androidController.js";
import { imageToBase64 } from "./util/imageUtils.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

class Master {
  private serial: SerialCommunication;
  private wss: WebSocketServer;
  private settingsManager: SettingsManager;
  private currentState: SlaveState;
  private rl: readline.Interface;
  private androidController: AndroidController;

  constructor() {
    this.serial = new SerialCommunication();
    this.wss = new WebSocketServer(8080);
    this.settingsManager = new SettingsManager("./settings.json");
    this.currentState = {
      status: "IDLE",
      router_state: RouterState.IDLE,
      push_cylinder: "OFF",
      riser_cylinder: "OFF",
      ejection_cylinder: "OFF",
      sensor1: "OFF",
    };

    // Setup CLI
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "slave> ",
    });

    this.androidController = new AndroidController();
  }

  async init(): Promise<void> {
    await this.settingsManager.loadSettings();

    // Initialize Android connection
    const androidConnected = await this.androidController.init();
    if (!androidConnected) {
      console.log(chalk.yellow("Warning: Failed to connect to Android device"));
    }

    const serialConnected = await this.serial.connect();
    if (!serialConnected) {
      throw new Error("Failed to connect to microcontroller");
    }
    this.setupSerialListeners();
    this.setupWebSocketListeners();
    this.setupCLI();
    this.sendInitialSettings();
    this.sendInitialState();
  }

  private setupCLI(): void {
    this.rl.prompt();

    this.rl.on("line", (line) => {
      const command = line.trim().toUpperCase();

      if (command === "HELP") {
        this.showHelp();
      } else if (command === "STATUS") {
        console.log(
          "Current State:",
          JSON.stringify(this.currentState, null, 2)
        );
      } else if (command === "SETTINGS") {
        console.log(
          "Current Settings:",
          JSON.stringify(this.settingsManager.getSettings(), null, 2)
        );
      } else if (command.startsWith("SET ")) {
        this.handleSetCommand(command.slice(4));
      } else if (command === "EXIT" || command === "QUIT") {
        this.cleanup();
      } else {
        console.log("Invalid command. Type HELP for available commands.");
      }

      this.rl.prompt();
    });

    this.rl.on("close", () => {
      this.cleanup();
    });
  }

  private handleSetCommand(params: string): void {
    const [key, value] = params.split("=").map((s) => s.trim());
    if (!key || !value) {
      console.log(chalk.red("Invalid SET command. Format: SET key=value"));
      return;
    }

    const numValue = parseInt(value);
    if (isNaN(numValue)) {
      console.log(chalk.red("Value must be a number"));
      return;
    }

    const settings: Partial<SlaveSettings> = {};
    switch (key.toLowerCase()) {
      case "pushtime":
        settings.pushTime = numValue;
        break;
      case "risertime":
        settings.riserTime = numValue;
        break;
      default:
        console.log(chalk.red("Unknown setting:"), key);
        return;
    }

    this.settingsManager.updateSettings(settings);
    const updatedSettings = this.settingsManager.getSettings();
    this.serial.sendSettings(updatedSettings);
    this.wss.broadcastSettings(updatedSettings);
    console.log(chalk.green("Settings updated successfully"));
  }

  private showHelp(): void {
    console.log(
      chalk.cyan(`
Available Commands:
  ${chalk.yellow("STATUS")}      - Show current state
  ${chalk.yellow("SETTINGS")}    - Show current settings
  ${chalk.yellow("SET key=value")} - Update settings (e.g., SET pushTime=3000)
  ${chalk.yellow("HELP")}        - Show this help message
  ${chalk.yellow("EXIT/QUIT")}   - Exit the program

Settings:
  ${chalk.green("pushTime")}    - Push cylinder activation time (ms)
  ${chalk.green("riserTime")}   - Riser cylinder activation time (ms)
    `)
    );
  }

  private cleanup(): void {
    console.log(chalk.yellow("Closing application..."));
    this.rl.close();
    process.exit(0);
  }

  sendInitialState() {
    this.wss.broadcastState(this.currentState);
  }

  private setupSerialListeners(): void {
    this.serial.onStateUpdate((state: SlaveState) => {
      this.currentState = state;
      this.wss.broadcastState(state);
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      console.log(chalk.blue("State Update:"), JSON.stringify(state, null, 2));
      this.rl.prompt(true);
    });

    this.serial.onWarning((message: string) => {
      this.wss.broadcastWarning(message);
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      console.log(chalk.yellow(`Warning from slave: ${message}`));
      this.rl.prompt(true);
    });

    this.serial.onError((message: string) => {
      this.wss.broadcastError(message);
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      console.log(chalk.red(`Error from slave: ${message}`));
      this.rl.prompt(true);
    });

    this.serial.onRawData((data: string) => {
      console.log(chalk.blue(`Raw data from slave: ${data}`));
    });

    // this.serial.onDebug((message: string) => {
    //   console.log(chalk.blue(`Debug from slave: ${message}`));
    // });

    const port = this.serial.getPort();
    if (port) {
      port.on("close", async () => {
        console.log(
          chalk.yellow("Serial port closed. Attempting to reconnect...")
        );
        await this.attemptReconnection();
      });
    }

    this.serial.onRawData((data: string) => {
      if (data.includes("STATE_REQUEST ANALYSIS_START")) {
        this.handleAnalysisRequest();
      }
    });
  }

  private setupWebSocketListeners(): void {
    this.wss.onCommand((command: Command) => {
      this.serial.sendCommand(command);
    });

    this.wss.onSettingsUpdate((newSettings: Partial<SlaveSettings>) => {
      this.settingsManager.updateSettings(newSettings);
      const updatedSettings = this.settingsManager.getSettings();
      this.serial.sendSettings(updatedSettings);
      this.wss.broadcastSettings(updatedSettings);
    });
  }

  private sendInitialSettings(): void {
    const settings = this.settingsManager.getSettings();
    this.serial.sendSettings(settings);
    this.wss.broadcastSettings(settings);
  }

  private async attemptReconnection(): Promise<void> {
    console.log(chalk.yellow("Attempting to reconnect to microcontroller..."));
    let connected = false;
    while (!connected) {
      connected = await this.serial.connect();
      if (!connected) {
        console.log(chalk.red("Reconnection failed. Retrying in 5 seconds..."));
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    console.log(chalk.green("Reconnected to microcontroller"));
    this.setupSerialListeners();
    this.sendInitialSettings();
  }

  private getRouterStateString(state: RouterState): string {
    return RouterState[state];
  }

  private async handleAnalysisRequest(): Promise<void> {
    this.wss.broadcastLog("Starting analysis...", "info");

    try {
      // Create temp directory for debug images if it doesn't exist
      const debugDir = path.join(os.tmpdir(), "router-control-debug");
      await fs.mkdir(debugDir, { recursive: true });

      // Check Android connection
      if (!(await this.androidController.checkConnection())) {
        this.wss.broadcastLog("Android device not connected", "error");
        this.serial.sendCommand("ANALYSIS_RESULT FALSE");
        return;
      }

      // Capture photo
      const photoPath = await this.androidController.capturePhoto();
      if (!photoPath) {
        this.wss.broadcastLog("Failed to capture photo", "error");
        this.serial.sendCommand("ANALYSIS_RESULT FALSE");
        return;
      }

      this.wss.broadcastLog(`Photo captured at: ${photoPath}`, "info");

      try {
        // Convert image to base64 and send to frontend
        const imageData = await imageToBase64(photoPath);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

        // Save original photo to debug directory
        const debugPhotoPath = path.join(debugDir, `original-${timestamp}.jpg`);
        await fs.copyFile(photoPath, debugPhotoPath);
        this.wss.broadcastLog(
          `Debug: Saved original photo to ${debugPhotoPath}`,
          "info"
        );

        // Save base64 data to debug directory for inspection
        const debugBase64Path = path.join(debugDir, `base64-${timestamp}.txt`);
        await fs.writeFile(debugBase64Path, imageData);
        this.wss.broadcastLog(
          `Debug: Saved base64 data to ${debugBase64Path}`,
          "info"
        );

        // Add data URL prefix if not present
        const imageDataWithPrefix = imageData.startsWith("data:image/")
          ? imageData
          : `data:image/jpeg;base64,${imageData}`;

        // Save the final data that will be sent to frontend
        const debugFinalPath = path.join(debugDir, `final-${timestamp}.txt`);
        await fs.writeFile(debugFinalPath, imageDataWithPrefix);
        this.wss.broadcastLog(
          `Debug: Saved final data to ${debugFinalPath}`,
          "info"
        );

        this.wss.broadcastLog("Sending image to frontend...", "info");
        this.wss.broadcastAnalysisImage({
          timestamp,
          imageData: imageDataWithPrefix,
          path: photoPath,
        });
        this.wss.broadcastLog("Image sent to frontend", "info");

        this.serial.sendCommand("ANALYSIS_RESULT TRUE");
      } catch (imageError) {
        this.wss.broadcastLog(
          `Failed to process image: ${
            imageError instanceof Error
              ? imageError.message
              : String(imageError)
          }`,
          "error"
        );
        this.serial.sendCommand("ANALYSIS_RESULT FALSE");
      }
    } catch (error) {
      this.wss.broadcastLog(
        `Analysis error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
      this.serial.sendCommand("ANALYSIS_RESULT FALSE");
    }
  }
}

// Handle process termination
process.on("SIGINT", () => {
  console.log(chalk.yellow("\nReceived SIGINT. Cleaning up..."));
  process.exit(0);
});

const master = new Master();
master.init().catch((error) => {
  console.error(chalk.red("Error initializing master:"), error);
  process.exit(1);
});
