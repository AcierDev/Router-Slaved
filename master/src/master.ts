import { SerialCommunication } from "./serialCommunication.js";
import { SettingsManager } from "./settings/settings.js";
import { Command, SlaveSettings, SlaveState } from "./typings/types.js";
import { WebSocketServer } from "./websocketServer.js";
import readline from "readline";

enum RouterState {
  IDLE,
  WAITING_FOR_PUSH,
  PUSHING,
  RAISING,
  ERROR,
}

class Master {
  private serial: SerialCommunication;
  private wss: WebSocketServer;
  private settingsManager: SettingsManager;
  private currentState: SlaveState;
  private rl: readline.Interface;

  constructor() {
    this.serial = new SerialCommunication();
    this.wss = new WebSocketServer(8080);
    this.settingsManager = new SettingsManager("./settings.json");
    this.currentState = {
      status: "IDLE",
      router_state: RouterState.IDLE,
      push_cylinder: "OFF",
      riser_cylinder: "OFF",
      sensor1: false,
    };

    // Setup CLI
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "slave> ",
    });
  }

  async init(): Promise<void> {
    await this.settingsManager.loadSettings();
    const connected = await this.serial.connect();
    if (!connected) {
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
      console.log("Invalid SET command. Format: SET key=value");
      return;
    }

    const numValue = parseInt(value);
    if (isNaN(numValue)) {
      console.log("Value must be a number");
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
        console.log("Unknown setting:", key);
        return;
    }

    this.settingsManager.updateSettings(settings);
    const updatedSettings = this.settingsManager.getSettings();
    this.serial.sendSettings(updatedSettings);
    this.wss.broadcastSettings(updatedSettings);
  }

  private showHelp(): void {
    console.log(`
Available Commands:
  STATUS      - Show current state
  SETTINGS    - Show current settings
  SET key=value - Update settings (e.g., SET pushTime=3000)
  HELP        - Show this help message
  EXIT/QUIT   - Exit the program

Settings:
  pushTime    - Push cylinder activation time (ms)
  riserTime   - Riser cylinder activation time (ms)
    `);
  }

  private cleanup(): void {
    console.log("Closing application...");
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
      // Clear line and reprint prompt after state update
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      console.log("State Update:", JSON.stringify(state));
      this.rl.prompt(true);
    });

    this.serial.onWarning((message: string) => {
      this.wss.broadcastWarning(message);
      // Clear line and reprint prompt after warning
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      console.log("\x1b[33m%s\x1b[0m", `Warning: ${message}`); // Yellow text
      this.rl.prompt(true);
    });

    this.serial.onError((message: string) => {
      this.wss.broadcastError(message);
      // Clear line and reprint prompt after error
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      console.log("\x1b[31m%s\x1b[0m", `Error: ${message}`); // Red text
      this.rl.prompt(true);
    });

    const port = this.serial.getPort();
    if (port) {
      port.on("close", async () => {
        console.log("Serial port closed. Attempting to reconnect...");
        await this.attemptReconnection();
      });
    }
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
    console.log("Attempting to reconnect to microcontroller...");
    let connected = false;
    while (!connected) {
      connected = await this.serial.connect();
      if (!connected) {
        console.log("Reconnection failed. Retrying in 5 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    console.log("Reconnected to microcontroller");
    this.setupSerialListeners();
    this.sendInitialSettings();
  }

  private getRouterStateString(state: RouterState): string {
    return RouterState[state];
  }
}

// Handle process termination
process.on("SIGINT", () => {
  console.log("\nReceived SIGINT. Cleaning up...");
  process.exit(0);
});

const master = new Master();
master.init().catch((error) => {
  console.error("Error initializing master:", error);
  process.exit(1);
});
