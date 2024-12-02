import { SerialCommunication } from "./serialCommunication";
import { SettingsManager } from "./settings/settings";
import { Command, SlaveSettings, SlaveState } from "./typings/types";
import { WebSocketServer } from "./websocketServer";
import readline from "readline";

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
      sensors: {},
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
      } else if (command === "EXIT" || command === "QUIT") {
        this.cleanup();
      } else if (this.isValidCommand(command)) {
        this.serial.sendCommand(command as Command);
        console.log(`Sent command: ${command}`);
      } else {
        console.log("Invalid command. Type HELP for available commands.");
      }

      this.rl.prompt();
    });

    this.rl.on("close", () => {
      this.cleanup();
    });
  }

  private isValidCommand(command: string): boolean {
    const validCommands = ["PUSH_ON", "PUSH_OFF", "EJECT_ON", "EJECT_OFF"];
    return validCommands.includes(command);
  }

  private showHelp(): void {
    console.log(`
Available Commands:
  PUSH_ON     - Activate push cylinder
  PUSH_OFF    - Deactivate push cylinder
  EJECT_ON    - Activate ejection cylinder
  EJECT_OFF   - Deactivate ejection cylinder
  STATUS      - Show current state
  HELP        - Show this help message
  EXIT/QUIT   - Exit the program
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
