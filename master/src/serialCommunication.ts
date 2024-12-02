import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { SlaveState, SlaveSettings, Command } from "./typings/types";
import { detectMicrocontrollerPort } from "./util/portDetection";
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
      console.error("Microcontroller not found");
      return false;
    }

    try {
      this.port = new SerialPort({ path: portPath, baudRate: 115200 });
      this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\r\n" }));
      console.log(`Connected to microcontroller on port ${portPath}`);
      return true;
    } catch (error) {
      console.error("Error connecting to microcontroller:", error);
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
          console.error(
            "\x1b[31m%s\x1b[0m",
            `Error sending command: ${err.message}`
          );
        }
      });
    } catch (error) {
      console.error("\x1b[31m%s\x1b[0m", `Failed to send command: ${error}`);
    }
  }

  sendSettings(settings: SlaveSettings): void {
    this.checkConnection();
    this.port!.write(`SETTINGS ${JSON.stringify(settings)}\n`);
  }

  onStateUpdate(callback: (state: SlaveState) => void): void {
    this.checkConnection();
    this.parser!.on("data", (data: string) => {
      console.log(chalk.green(`Received raw data: ${data}`));

      if (data.startsWith("STATE")) {
        const stateData = JSON.parse(data.slice(6));
        callback(stateData);
      } else if (data.startsWith("WARNING")) {
        console.log(chalk.yellow(`Warning from slave: ${data.slice(8)}`));
      } else if (data.startsWith("ERROR")) {
        console.log(chalk.red(`Error from slave: ${data.slice(6)}`));
      }
    });
  }

  onWarning(callback: (message: string) => void): void {
    this.checkConnection();
    this.parser!.on("data", (data: string) => {
      if (data.startsWith("WARNING")) {
        callback(data.slice(8));
      }
    });
  }

  onError(callback: (message: string) => void): void {
    this.checkConnection();
    this.parser!.on("data", (data: string) => {
      if (data.startsWith("ERROR")) {
        callback(data.slice(6));
      }
    });
  }

  getPort(): SerialPort | null {
    return this.port;
  }
}
