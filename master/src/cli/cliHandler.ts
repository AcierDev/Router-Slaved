import readline from "readline";
import chalk from "chalk";
import {
  ExtendedState,
  Settings,
  SlaveSettings,
  EjectionSettings,
  RouterState,
} from "../typings/types.js";
import { SettingsManager } from "../settings/settings.js";
import { SerialCommunication } from "../serialCommunication.js";
import { WebSocketServer } from "../websocketServer.js";
import { Master } from "../master.js";

export class CLIHandler {
  private rl: readline.Interface;
  private settingsManager: SettingsManager;
  private serial: SerialCommunication;
  private wss: WebSocketServer;
  private currentState: ExtendedState;
  private master: Master;

  constructor(
    settingsManager: SettingsManager,
    serial: SerialCommunication,
    wss: WebSocketServer,
    master: Master
  ) {
    this.settingsManager = settingsManager;
    this.serial = serial;
    this.wss = wss;
    this.master = master;

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

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "slave> ",
    });
  }

  setup(): void {
    this.rl.prompt();
    this.rl.on("line", this.handleCommand.bind(this));
    this.rl.on("close", this.cleanup.bind(this));
  }

  private handleCommand(line: string): void {
    const command = line.trim().toUpperCase();

    switch (command) {
      case "HELP":
        this.showHelp();
        break;
      case "STATUS":
        console.log(
          "Current State:",
          JSON.stringify(this.currentState, null, 2)
        );
        break;
      case "SETTINGS":
        console.log(
          "Current Settings:",
          JSON.stringify(this.settingsManager.getSettings(), null, 2)
        );
        break;
      case "EXIT":
      case "QUIT":
        this.cleanup();
        break;
      case "UPLOAD":
        this.handleUpload();
        break;
      default:
        if (command.startsWith("SET ")) {
          this.handleSetCommand(command.slice(4));
        } else {
          console.log("Invalid command. Type HELP for available commands.");
        }
    }

    this.rl.prompt();
  }

  private handleSetCommand(params: string): void {
    const [key, value] = params.split("=").map((s) => s.trim());
    if (!key || !value) {
      console.log(chalk.red("Invalid SET command. Format: SET key=value"));
      return;
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      console.log(chalk.red("Value must be a number"));
      return;
    }

    const [category, setting] = key.toLowerCase().split(".");

    if (category === "slave") {
      const settings: Partial<SlaveSettings> = {};
      switch (setting) {
        case "pushtime":
          settings.pushTime = numValue;
          break;
        case "risertime":
          settings.riserTime = numValue;
          break;
        default:
          console.log(chalk.red("Unknown slave setting:"), setting);
          return;
      }
      this.settingsManager.updateSlaveSettings(settings);
      const updatedSettings = this.settingsManager.getSlaveSettings();
      this.serial.sendSettings(updatedSettings);
    } else if (category === "ejection") {
      const settings: Partial<EjectionSettings> = {
        globalSettings: {
          requireMultipleDefects: false,
          minTotalArea: 100,
          maxDefectsBeforeEject: 5,
        },
      };
      switch (setting) {
        case "maxdefects":
          settings.globalSettings!.maxDefectsBeforeEject = Math.round(numValue);
          break;
        case "minarea":
          settings.globalSettings!.minTotalArea = Math.round(numValue);
          break;
        default:
          console.log(chalk.red("Unknown ejection setting:"), setting);
          return;
      }
      this.settingsManager.updateEjectionSettings(settings);
    } else {
      console.log(chalk.red("Unknown settings category:"), category);
      return;
    }

    this.wss.broadcastSettings(this.settingsManager.getSettings());
    console.log(chalk.green("Settings updated successfully"));
  }

  private async handleUpload(): Promise<void> {
    console.log(chalk.cyan("Starting slave code upload..."));
    try {
      const uploaded = await this.master.uploadSlave();
      if (uploaded) {
        console.log(chalk.green("✓ Slave code uploaded successfully"));
      } else {
        console.log(chalk.red("✗ Failed to upload slave code"));
      }
    } catch (error) {
      console.error(chalk.red("Error uploading slave code:"), error);
    }
  }

  private showHelp(): void {
    console.log(
      chalk.cyan(`
Available Commands:
  ${chalk.yellow("STATUS")}      - Show current state
  ${chalk.yellow("SETTINGS")}    - Show current settings
  ${chalk.yellow("SET key=value")} - Update settings
  ${chalk.yellow("UPLOAD")}      - Upload code to slave
  ${chalk.yellow("HELP")}        - Show this help message
  ${chalk.yellow("EXIT/QUIT")}   - Exit the program
    `)
    );
  }

  cleanup(): void {
    console.log(chalk.yellow("Closing application..."));
    this.rl.close();
    process.exit(0);
  }

  updateState(newState: ExtendedState): void {
    this.currentState = newState;
  }
}
