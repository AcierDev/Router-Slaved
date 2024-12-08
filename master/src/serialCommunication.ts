import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { SlaveState, SlaveSettings, Command } from "./typings/types";
import { detectMicrocontrollerPort } from "./util/portDetection.js";
import chalk from "chalk";
import { EventEmitter } from "events";

export class SerialCommunication {
  private port: SerialPort | null;
  private parser: ReadlineParser | null;
  private lastHeartbeatTime: number;
  private bootCount: number;
  private debug: boolean;
  private baudRate: number = 115200;
  private heartbeatTimeout: number;
  private heartbeatCheckInterval: NodeJS.Timeout | null;
  private eventEmitter: EventEmitter;
  private maxReconnectAttempts: number = 5;
  private reconnectAttempt: number = 0;
  private baseReconnectDelay: number = 2000; // 2 seconds
  private lastKnownState: string = "";

  constructor() {
    this.port = null;
    this.parser = null;
    this.lastHeartbeatTime = 0;
    this.bootCount = 0;
    this.debug = false;
    this.heartbeatTimeout = 5000;
    this.heartbeatCheckInterval = null;
    this.eventEmitter = new EventEmitter();
  }

  async connect(): Promise<boolean> {
    console.log(chalk.cyan("🔍 Detecting microcontroller port..."));
    const portPath = await this.detectPort();
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

    // Add port status monitoring
    this.port?.on("open", () => {
      console.log(chalk.green("Serial port opened"));
    });

    this.port?.on("close", () => {
      console.log(chalk.yellow("Serial port closed - Details:"));
      console.log("Last known state:", this.lastKnownState);
      console.log(
        "Time since last heartbeat:",
        Date.now() - this.lastHeartbeatTime
      );
    });

    this.port?.on("error", (error) => {
      console.log(chalk.red("Serial port error:"), error);
      console.log("Error occurred during state:", this.lastKnownState);
    });

    // Track state changes
    this.parser.on("data", (data: string) => {
      if (data.includes("router_state")) {
        try {
          const stateData = JSON.parse(
            data.includes("STATE") ? data.slice(6) : data.slice(9)
          );
          this.lastKnownState = stateData.router_state;
        } catch (error) {
          // Ignore parse errors for non-state messages
        }
      }
    });
  }

  cleanup(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }

    if (this.port?.isOpen) {
      try {
        // Use close() with a drain first
        this.port.drain(() => {
          this.port?.close();
        });
      } catch (error) {
        console.error(chalk.yellow("Warning during port cleanup:"), error);
      }
    }

    // Clear references
    this.port = null;
    this.parser = null;
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

  private async attemptReconnection(): Promise<void> {
    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      console.error(chalk.red("Max reconnection attempts reached"));
      this.emit("error", "Max reconnection attempts reached");
      // Reset counter but stop trying
      this.reconnectAttempt = 0;
      return;
    }

    this.reconnectAttempt++;
    console.log(
      chalk.yellow(
        `Reconnection attempt ${this.reconnectAttempt}/${this.maxReconnectAttempts}`
      )
    );

    // Force close any existing connections
    if (this.port) {
      try {
        await new Promise<void>((resolve) => {
          this.port?.close(() => resolve());
        });
      } catch (error) {
        console.error("Error closing port:", error);
      }
      this.port = null;
    }

    try {
      // Try to detect and open port
      const portPath = await this.detectPort();
      if (!portPath) {
        console.log(chalk.red("✗ Microcontroller not found"));
        const delay =
          this.baseReconnectDelay * Math.pow(2, this.reconnectAttempt - 1);
        console.log(
          chalk.yellow(`Waiting ${delay / 1000} seconds before next attempt...`)
        );
        setTimeout(() => this.attemptReconnection(), delay);
        return;
      }

      // Create new port instance
      this.port = new SerialPort({
        path: portPath,
        baudRate: this.baudRate,
        autoOpen: false,
      });

      // Open port with timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Port open timeout"));
        }, 5000);

        this.port?.open((error) => {
          clearTimeout(timeout);
          if (error) {
            // Check for specific error conditions
            if (error.message.includes("Resource temporarily unavailable")) {
              console.log(
                chalk.yellow("Port is locked, waiting for release...")
              );
              setTimeout(() => this.attemptReconnection(), 5000);
              resolve(); // Resolve without throwing to prevent unhandled rejection
              return;
            }
            reject(error);
          } else {
            this.setupParser();
            resolve();
          }
        });
      });

      console.log(chalk.green("✓ Reconnected successfully"));
      // Reset attempt counter on successful connection
      this.reconnectAttempt = 0;
    } catch (error) {
      console.error(chalk.red("Reconnection failed:"), error);
      // Emit error but don't throw
      this.emit(
        "error",
        `Reconnection failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      // Calculate exponential backoff delay
      const delay =
        this.baseReconnectDelay * Math.pow(2, this.reconnectAttempt - 1);
      setTimeout(() => this.attemptReconnection(), delay);
    }
  }

  private setupParser(): void {
    this.parser = this.port!.pipe(new ReadlineParser({ delimiter: "\n" }));
    this.setupSerialListeners();
  }

  private async detectPort(): Promise<string | null> {
    return await detectMicrocontrollerPort();
  }
}
