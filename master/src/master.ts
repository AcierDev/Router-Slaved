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
import { StatsManager } from "./stats/StatsManager.js";

// Add this utility function
async function imageToBase64(imagePath: string): Promise<string> {
  const imageBuffer = await fs.readFile(imagePath);
  return imageBuffer.toString("base64");
}

export class Master {
  private serial: SerialCommunication;
  private wss: WebSocketServer;
  private settingsManager: SettingsManager;
  private platformIO: PlatformIOManager;
  private currentState: SlaveState;
  private currentState: ExtendedState;
  private androidController: AndroidController;
  private analysisService: AnalysisService;
  private cliHandler: CLIHandler;
  private statsManager: StatsManager;

  constructor() {
    this.serial = new SerialCommunication();
    this.wss = new WebSocketServer(8080);
    this.settingsManager = new SettingsManager("./settings.json");
    this.androidController = new AndroidController();
    this.analysisService = new AnalysisService();
    this.statsManager = new StatsManager();

    const slavePath = path.join(__dirname, "../../slave");
    this.platformIO = new PlatformIOManager(slavePath);
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
    console.log("Initializing master...");
    if (!(await this.platformIO.verifyPlatformIO())) {
      throw new Error("PlatformIO CLI is required but not found");
    }

    const uploaded = await this.platformIO.uploadCode();
    if (!uploaded) {
      throw new Error("Failed to upload slave code");
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    await this.settingsManager.loadSettings();
    console.log(chalk.green("✓ Settings loaded successfully"));

    // Initialize WebSocket server with current settings
    const settings = this.settingsManager.getSettings();
    this.wss.broadcastSettings(settings);

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
    await this.statsManager.init();
  }

  private sendInitialState(): void {
    this.wss.broadcastState(this.currentState);
  }

  private setupSerialListeners(): void {
    this.serial.onStateUpdate((state: SlaveState) => {
      if (state.sensor1 === "ON" && this.currentState.sensor1 === "OFF") {
        this.statsManager.startCycle();
        this.statsManager.recordSensor1Trigger();
      }

      if (
        state.router_state === RouterState.IDLE &&
        this.currentState.router_state === RouterState.PUSHING
      ) {
        console.log("[Master] Cycle end detected");
        this.statsManager.endCycle().then((stats) => {
          if (stats) {
            this.wss.broadcastCycleStats(stats.cycleStats);
            this.wss.broadcastDailyStats(stats.dailyStats);
          }
        });
      }

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

    this.serial.onDebug((data: string) => {
      if (data.includes("Sensor 1 changed")) {
        console.log(chalk.blue(`🔌 ${data}`));
      } else {
        console.log(chalk.gray(`Debug: ${data}`));
      }
    });

    this.serial.onRawData((data: string) => {
      if (data.includes("SLAVE_REQUEST ANALYSIS_START")) {
        this.handleAnalysisRequest();
      } else if (data.includes("SLAVE_REQUEST NON_ANALYSIS_CYCLE")) {
        this.handleNonAnalysisCycle();
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
    this.wss.broadcastLog("Starting image capture...", "info");

    this.currentState.isCapturing = true;
    this.currentState.isAnalyzing = false;
    this.currentState.status = "CAPTURING";
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
      const captureStartTime = Date.now();
      const photoPath = await this.androidController.capturePhoto();
      this.statsManager.recordCaptureTime(Date.now() - captureStartTime);

      this.currentState.isCapturing = false;
      this.wss.broadcastState(this.currentState);

      if (!photoPath) {
        this.currentState.isAnalyzing = false; // Reset analyzing state on error
        this.wss.broadcastState(this.currentState);
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
        console.log(chalk.cyan("Starting analysis..."));
        this.wss.broadcastLog("Starting analysis...", "info");
        this.currentState.isAnalyzing = true;
        this.wss.broadcastState(this.currentState);

        this.statsManager.startAnalysis();
        const analysisResult = await this.analysisService.analyzeImage(
          photoPath
        );

        if (!analysisResult) {
          throw new Error("Analysis result is undefined");
        }

        console.log(
          chalk.cyan("Analysis result:"),
          JSON.stringify(analysisResult)
        );
        this.wss.broadcastAnalysisResults(analysisResult);

        const shouldEjectResult = this.analysisService.shouldEject(
          analysisResult.data.predictions,
          this.settingsManager.getEjectionSettings()
        );

        // Record analysis results with ejection reasons
        this.statsManager.recordAnalysisResult(
          shouldEjectResult.decision,
          analysisResult.data.predictions,
          analysisResult.data.predictions.reduce(
            (sum, pred) => sum + this.analysisService.calculateArea(pred.bbox),
            0
          ),
          shouldEjectResult.reasons
        );

        // Broadcast current cycle stats immediately after recording results
        const currentCycleStats = this.statsManager.getCurrentCycleStats();
        if (currentCycleStats) {
          this.wss.broadcastCycleStats(currentCycleStats);
        }

        console.log(chalk.cyan("Ejection decision:"), shouldEjectResult);
        this.wss.broadcastEjectionDecision(shouldEjectResult.decision);

        console.log(
          chalk.green(
            `✓ Analysis complete. Ejection decision: ${
              shouldEjectResult.decision ? "EJECT" : "PASS"
            }`
          )
        );
        console.log(
          chalk.cyan("Sending analysis result to slave:"),
          shouldEjectResult.decision
        );
        this.serial.sendCommand(
          `ANALYSIS_RESULT ${shouldEjectResult.decision ? "TRUE" : "FALSE"}`
        );
        this.wss.broadcastLog(
          `Analysis complete. Ejection decision: ${
            shouldEjectResult.decision
              ? `EJECT: ${shouldEjectResult.reasons.join(", ")}`
              : "PASS"
          }`,
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
      } finally {
        this.currentState.isAnalyzing = false; // Reset analyzing state after completion
        this.wss.broadcastState(this.currentState);
      }
    } catch (error) {
      this.currentState.isCapturing = false;
      this.currentState.isAnalyzing = false; // Reset analyzing state on error
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
    } finally {
      // End cycle and broadcast final stats
      const stats = await this.statsManager.endCycle();
      if (stats) {
        this.wss.broadcastCycleStats(stats.cycleStats);
        this.wss.broadcastDailyStats(stats.dailyStats);
      }
    }
  }

  private async handleNonAnalysisCycle(): Promise<void> {
    console.log(chalk.cyan("📝 Recording non-analysis cycle"));

    try {
      // Record the cycle without analysis data
      this.statsManager.recordAnalysisResult(
        false, // no ejection
        [], // no predictions
        0, // no defect area
        ["Non-analysis cycle"] // reason
      );

      // End cycle and broadcast final stats
      const stats = await this.statsManager.endCycle();
      if (stats) {
        this.wss.broadcastCycleStats(stats.cycleStats);
        this.wss.broadcastDailyStats(stats.dailyStats);
      }
    } catch (error) {
      console.error(chalk.red("Error recording non-analysis cycle:"), error);
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
