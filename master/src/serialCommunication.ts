import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { SlaveState, SlaveSettings, Command } from "./typings/types";
import { detectMicrocontrollerPort } from "./util/portDetection.js";
import chalk from "chalk";
import { EventEmitter } from "events";

export class SerialCommunication {
  private port: SerialPort | null;
  private parser: ReadlineParser | null;
  private lastHeartbeatTime: number = 0;
  private heartbeatTimeout: number = 5000; // 5 seconds timeout
  private bootCount: number = 0;
  private heartbeatCheckInterval: NodeJS.Timeout | null = null;
  private debug: boolean = false;
  private eventEmitter: EventEmitter;

  constructor() {
    this.port = null;
    this.parser = null;
    this.eventEmitter = new EventEmitter();
  }

  async connect(): Promise<boolean> {
    console.log(chalk.cyan("🔍 Detecting microcontroller port..."));
    const portPath = await detectMicrocontrollerPort();
    if (!portPath) {
      console.error(chalk.red("✗ Microcontroller not found"));
      return false;
    }

    try {
      this.port = new SerialPort({ path: portPath, baudRate: 115200 });
      this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\r\n" }));
      console.log(chalk.green(`✓ Connected to microcontroller on ${portPath}`));

      this.setupSerialListeners(); // Setup listeners before starting heartbeat monitoring
      this.startHeartbeatMonitoring();
      return true;
    } catch (error) {
      console.error(
        chalk.red(`✗ Error connecting to microcontroller: ${error}`)
      );
      return false;
    }
  }

  private emit(event: string, message: string): void {
    this.eventEmitter.emit(event, message);
  }

  on(event: string, callback: (message: string) => void): void {
    this.eventEmitter.on(event, callback);
  }

  private startHeartbeatMonitoring(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
    }

    this.heartbeatCheckInterval = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeatTime;
      if (
        this.lastHeartbeatTime !== 0 &&
        timeSinceLastHeartbeat > this.heartbeatTimeout
      ) {
        console.log(
          chalk.red(
            `⚠️ No heartbeat received for ${(
              timeSinceLastHeartbeat / 1000
            ).toFixed(1)}s`
          )
        );
        this.emit("warning", "Lost communication with slave controller");
      }
    }, 1000);
  }

  private setupSerialListeners(): void {
    if (!this.parser) {
      throw new Error("Serial parser not initialized");
    }

    this.parser.on("data", (data: string) => {
      if (data.startsWith("HEARTBEAT")) {
        try {
          const heartbeatData = JSON.parse(data.slice(9));
          this.lastHeartbeatTime = Date.now();

          if (heartbeatData.boot_count !== this.bootCount) {
            this.bootCount = heartbeatData.boot_count;
            console.log(
              chalk.yellow(
                `⚠️ Slave controller rebooted! Boot count: ${this.bootCount}`
              )
            );
            this.emit(
              "warning",
              `Slave controller rebooted (boot #${this.bootCount})`
            );
          }

          if (this.debug) {
            console.log(
              chalk.gray(
                `💓 Heartbeat received - Uptime: ${heartbeatData.uptime}ms`
              )
            );
          }
        } catch (error) {
          console.error(chalk.red("Error parsing heartbeat:", error));
        }
      }
    });

    // Handle port errors
    this.port?.on("error", (error) => {
      console.error(chalk.red("Serial port error:", error));
      this.emit("error", `Serial port error: ${error.message}`);
    });

    // Handle port closing
    this.port?.on("close", () => {
      console.log(chalk.yellow("Serial port closed"));
      this.emit("warning", "Serial port closed unexpectedly");
      this.cleanup();
    });
  }

  cleanup(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }

    if (this.port?.isOpen) {
      this.port.close((err) => {
        if (err) {
          console.error(chalk.red("Error closing port:", err));
        }
      });
    }

    this.lastHeartbeatTime = 0;
    this.bootCount = 0;
  }

  private checkConnection() {
    if (!this.port || !this.parser) {
      throw new Error("Serial port not connected");
    }
  }

  sendCommand(command: Command): void {
    this.checkConnection();
    try {
      console.log(chalk.cyan(`📤 Sending command: ${command}`));
      this.port!.write(`${command}\n`, (err) => {
        if (err) {
          console.error(chalk.red(`✗ Error sending command: ${err.message}`));
        }
      });
    } catch (error) {
      console.error(chalk.red(`✗ Failed to send command: ${error}`));
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
        callback(message);
      }
    });
  }

  onError(callback: (message: string) => void): void {
    this.checkConnection();
    this.parser!.on("data", (data: string) => {
      if (data.startsWith("ERROR")) {
        const message = data.slice(6);
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
      if (data.startsWith("DEBUG:")) {
        const message = data.slice(7);
        callback(message);
      }
    });
  }

  getPort(): SerialPort | null {
    return this.port;
  }
}
