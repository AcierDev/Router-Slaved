import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { SlaveState, SlaveSettings, Command } from "./typings/types";
import { detectMicrocontrollerPort } from "./util/portDetection.js";
import chalk from "chalk";

export class SerialCommunication {
  private port: SerialPort | null;
  private parser: ReadlineParser | null;

  constructor() {
    this.port = null;
    this.parser = null;
  }

  async connect(): Promise<boolean> {
    const portPath = await detectMicrocontrollerPort();
    if (!portPath) {
      console.error(chalk.red("Microcontroller not found"));
      return false;
    }

    try {
      this.port = new SerialPort({ path: portPath, baudRate: 115200 });
      this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\r\n" }));
      console.log(
        chalk.green(`Connected to microcontroller on port ${portPath}`)
      );
      return true;
    } catch (error) {
      console.error(chalk.red("Error connecting to microcontroller:"), error);
      return false;
    }
  }

  private checkConnection() {
    if (!this.port || !this.parser) {
      throw new Error("Serial port not connected");
    }
  }

  sendCommand(command: Command): void {
    this.checkConnection();
    try {
      this.port!.write(`${command}\n`, (err) => {
        if (err) {
          console.error(chalk.red(`Error sending command: ${err.message}`));
        }
      });
    } catch (error) {
      console.error(chalk.red(`Failed to send command: ${error}`));
    }
  }

  sendSettings(settings: SlaveSettings): void {
    this.checkConnection();
    this.port!.write(`SETTINGS ${JSON.stringify(settings)}\n`);
  }

  onStateUpdate(callback: (state: SlaveState) => void): void {
    this.checkConnection();
    this.parser!.on("data", (data: string) => {
      if (data.startsWith("STATE")) {
        try {
          const stateData = JSON.parse(data.slice(6));
          callback(stateData);
        } catch (error) {
          console.error(chalk.red("Error parsing state data:", error));
        }
      }
    });
  }

  onWarning(callback: (message: string) => void): void {
    this.checkConnection();
    this.parser!.on("data", (data: string) => {
      if (data.startsWith("WARNING")) {
        const message = data.slice(8);
        console.log(chalk.yellow(`Warning from slave: ${message}`));
        callback(message);
      }
    });
  }

  onError(callback: (message: string) => void): void {
    this.checkConnection();
    this.parser!.on("data", (data: string) => {
      if (data.startsWith("ERROR")) {
        const message = data.slice(6);
        console.log(chalk.red(`Error from slave: ${message}`));
        callback(message);
      }
    });
  }

  onRawData(callback: (data: string) => void): void {
    this.checkConnection();
    this.parser!.on("data", callback);
  }

  onDebug(callback: (data: string) => void): void {
    this.checkConnection();
    this.parser!.on("data", (data: string) => {
      // Change from data.trim().startsWith("DEBUG") to data.startsWith("DEBUG:")
      if (data.startsWith("DEBUG:")) {
        // Change slice(6) to slice(7) to account for the colon
        const message = data.slice(7);
        console.log(chalk.blue(`Debug from slave: ${message}`));
        callback(message);
      }
    });
  }

  getPort(): SerialPort | null {
    return this.port;
  }
}
