import { SerialCommunication } from "./serialCommunication.js";
import { SettingsManager } from "./settings/settings.js";
import { WebSocketServer } from "./websocketServer.js";
import { AndroidController } from "./android/androidController.js";
import { AnalysisService } from "./services/analysisService.js";
import { CLIHandler } from "./cli/cliHandler.js";
import { ExtendedState, RouterState, SlaveState } from "./typings/types.js";
import os from "os";
import path from "path";
import fs from "fs/promises";
import chalk from "chalk";

// Add this utility function
async function imageToBase64(imagePath: string): Promise<string> {
  const imageBuffer = await fs.readFile(imagePath);
  return imageBuffer.toString("base64");
}

export class Master {
  private serial: SerialCommunication;
  private wss: WebSocketServer;
  private settingsManager: SettingsManager;
  private currentState: ExtendedState;
  private androidController: AndroidController;
  private analysisService: AnalysisService;
  private cliHandler: CLIHandler;

  constructor() {
    this.serial = new SerialCommunication();
    this.wss = new WebSocketServer(8080);
    this.settingsManager = new SettingsManager("./settings.json");
    this.androidController = new AndroidController();
    this.analysisService = new AnalysisService();

    this.currentState = {
      status: "IDLE",
      router_state: RouterState.IDLE,
      push_cylinder: "OFF",
      riser_cylinder: "OFF",
      ejection_cylinder: "OFF",
      sensor1: "OFF",
      isCapturing: false,
      isAnalyzing: false,
    };

    this.cliHandler = new CLIHandler(
      this.settingsManager,
      this.serial,
      this.wss
    );
  }

  async init(): Promise<void> {
    console.log(chalk.cyan("🚀 Initializing Router Control System..."));
    await this.settingsManager.loadSettings();
    console.log(chalk.green("✓ Settings loaded successfully"));

    // Initialize Android connection
    console.log(chalk.cyan("📱 Connecting to Android device..."));
    const androidConnected = await this.androidController.init();
    if (!androidConnected) {
      console.log(
        chalk.yellow("⚠️  Warning: Failed to connect to Android device")
      );
    } else {
      console.log(chalk.green("✓ Android device connected successfully"));
    }

    console.log(chalk.cyan("🔌 Connecting to microcontroller..."));
    const serialConnected = await this.serial.connect();
    if (!serialConnected) {
      console.log(chalk.red("✗ Failed to connect to microcontroller"));
      throw new Error("Failed to connect to microcontroller");
    }
    console.log(chalk.green("✓ Microcontroller connected successfully"));

    this.setupSerialListeners();
    this.setupWebSocketListeners();
    this.cliHandler.setup();
    this.sendInitialSettings();
    this.sendInitialState();
  }

  private sendInitialState(): void {
    this.wss.broadcastState(this.currentState);
  }

  private setupSerialListeners(): void {
    this.serial.onStateUpdate((state: SlaveState) => {
      this.currentState = {
        ...state,
        isCapturing: this.currentState.isCapturing,
        isAnalyzing: this.currentState.isAnalyzing,
      };
      this.wss.broadcastState(this.currentState);
      this.cliHandler.updateState(this.currentState);
    });

    this.serial.onWarning((message: string) => {
      this.wss.broadcastWarning(message);
      console.log(chalk.yellow(`Warning from slave: ${message}`));
    });

    this.serial.onError((message: string) => {
      this.wss.broadcastError(message);
      console.log(chalk.red(`Error from slave: ${message}`));
    });

    this.serial.onRawData((data: string) => {
      if (data.includes("SLAVE_REQUEST ANALYSIS_START")) {
        this.handleAnalysisRequest();
      }
    });

    const port = this.serial.getPort();
    if (port) {
      port.on("close", async () => {
        console.log(
          chalk.yellow("Serial port closed. Attempting to reconnect...")
        );
        await this.attemptReconnection();
      });
    }
  }

  private setupWebSocketListeners(): void {
    this.wss.onCommand((command) => {
      this.serial.sendCommand(command);
    });

    this.wss.onSettingsUpdate((newSettings) => {
      this.settingsManager.updateSettings(newSettings);
      const slaveSettings = this.settingsManager.getSlaveSettings();
      this.serial.sendSettings(slaveSettings);
      this.wss.broadcastSettings(this.settingsManager.getSettings());
    });
  }

  private sendInitialSettings(): void {
    const settings = this.settingsManager.getSettings();
    this.serial.sendSettings(settings.slave);
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

  private async handleAnalysisRequest(): Promise<void> {
    console.log(chalk.cyan("📸 Analysis request received"));
    this.wss.broadcastLog("Starting analysis...", "info");

    this.currentState.isCapturing = true;
    this.wss.broadcastState(this.currentState);

    try {
      console.log(chalk.cyan("📁 Creating debug directory..."));
      const debugDir = path.join(os.tmpdir(), "router-control-debug");
      await fs.mkdir(debugDir, { recursive: true });

      // Check Android connection
      console.log(chalk.cyan("📱 Checking Android connection..."));
      if (!(await this.androidController.checkConnection())) {
        console.log(chalk.red("✗ Android device not connected"));
        this.wss.broadcastLog("Android device not connected", "error");
        this.serial.sendCommand("ANALYSIS_RESULT FALSE");
        return;
      }

      // Capture photo
      console.log(chalk.cyan("📸 Capturing photo..."));
      const photoPath = await this.androidController.capturePhoto();

      this.currentState.isCapturing = false;
      this.wss.broadcastState(this.currentState);

      if (!photoPath) {
        console.log(chalk.red("✗ Failed to capture photo"));
        this.wss.broadcastLog("Failed to capture photo", "error");
        this.serial.sendCommand("ANALYSIS_RESULT FALSE");
        return;
      }

      console.log(chalk.green(`✓ Photo captured successfully: ${photoPath}`));
      this.wss.broadcastLog(`Photo captured at: ${photoPath}`, "info");

      // Convert and send image to frontend
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const imageData = await imageToBase64(photoPath);

      // Save debug files
      const debugPhotoPath = path.join(debugDir, `original-${timestamp}.jpg`);
      await fs.copyFile(photoPath, debugPhotoPath);

      const imageDataWithPrefix = `data:image/jpeg;base64,${imageData}`;

      // Send to frontend
      this.wss.broadcastLog("Sending image to frontend...", "info");
      this.wss.broadcastAnalysisImage({
        timestamp,
        imageData: imageDataWithPrefix,
        path: photoPath,
      });
      this.wss.broadcastLog("Image sent to frontend", "info");

      try {
        console.log(chalk.cyan("🔍 Analyzing image..."));
        const analysisResult = await this.analysisService.analyzeImage(
          photoPath
        );

        if (!analysisResult.success) {
          throw new Error("Analysis failed");
        }

        const shouldEjectResult = this.analysisService.shouldEject(
          analysisResult.data.predictions,
          this.settingsManager.getEjectionSettings()
        );

        console.log(
          chalk.green(
            `✓ Analysis complete. Ejection decision: ${
              shouldEjectResult ? "EJECT" : "PASS"
            }`
          )
        );
        this.serial.sendCommand(
          `ANALYSIS_RESULT ${shouldEjectResult ? "TRUE" : "FALSE"}`
        );
        this.wss.broadcastLog(
          `Analysis complete. Ejection decision: ${shouldEjectResult}`,
          "info"
        );
      } catch (error) {
        console.log(
          chalk.red(
            `✗ Analysis failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
        this.wss.broadcastLog(
          `Failed to process image: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "error"
        );
        this.serial.sendCommand("ANALYSIS_RESULT FALSE");
      }
    } catch (error) {
      this.currentState.isCapturing = false;
      this.wss.broadcastState(this.currentState);

      console.log(
        chalk.red(
          `✗ Analysis error: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      );
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
  console.log(chalk.yellow("\n👋 Gracefully shutting down..."));
  process.exit(0);
});

const master = new Master();
master.init().catch((error) => {
  console.error(chalk.red("💥 Fatal Error:"), error);
  process.exit(1);
});
