import { SerialCommunication } from "./serialCommunication";
import { SettingsManager } from "./settings/settings";
import { Command, SlaveSettings, SlaveState } from "./typings/types";
import { WebSocketServer } from "./websocketServer";
import { PlatformIOManager } from "./util/platformioManager";
import path from "path";

class Master {
  private serial: SerialCommunication;
  private wss: WebSocketServer;
  private settingsManager: SettingsManager;
  private platformIO: PlatformIOManager;
  private currentState: SlaveState;

  constructor() {
    this.serial = new SerialCommunication();
    this.wss = new WebSocketServer(8080);
    this.settingsManager = new SettingsManager("./settings.json");
    const slavePath = path.join(__dirname, "../../slave");
    this.platformIO = new PlatformIOManager(slavePath);
    this.currentState = {
      status: "IDLE",
      sensors: {},
    };
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
    const connected = await this.serial.connect();
    if (!connected) {
      throw new Error("Failed to connect to microcontroller");
    }
    this.setupSerialListeners();
    this.setupWebSocketListeners();
    this.sendInitialSettings();
    this.sendInitialState();
  }
  sendInitialState() {
    this.wss.broadcastState(this.currentState);
  }

  private setupSerialListeners(): void {
    this.serial.onStateUpdate((state: SlaveState) => {
      this.currentState = state;
      this.wss.broadcastState(state);
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

const master = new Master();
master.init().catch((error) => {
  console.error("Error initializing master:", error);
  process.exit(1);
});
