import { WebSocket, WebSocketServer as WSServer } from "ws";
import {
  Command,
  SlaveSettings,
  SlaveState,
  WebSocketMessage,
  AnalysisImage,
  Settings,
  DetectionResponse,
} from "./typings/types";
import chalk from "chalk";

export class WebSocketServer {
  private wss: WSServer;
  private connectedClients: number = 0;
  private currentSettings: Settings | null = null;

  constructor(port: number) {
    this.wss = new WSServer({ port });
    console.log(chalk.cyan(`🌐 WebSocket server started on port ${port}`));

    // Setup connection handling
    this.wss.on("connection", (ws, req) => {
      this.connectedClients++;
      const clientIp = req.socket.remoteAddress;
      console.log(chalk.green(`📱 New client connected from ${clientIp}`));
      console.log(
        chalk.cyan(`👥 Total connected clients: ${this.connectedClients}`)
      );

      // Send current settings to new client if available
      if (this.currentSettings) {
        ws.send(
          JSON.stringify({
            type: "settingsUpdate",
            data: this.currentSettings,
          })
        );
      }

      // Handle client disconnection
      ws.on("close", () => {
        this.connectedClients--;
        console.log(chalk.yellow(`📴 Client disconnected from ${clientIp}`));
        console.log(
          chalk.cyan(`👥 Total connected clients: ${this.connectedClients}`)
        );
      });
    });
  }

  broadcastState(state: SlaveState): void {
    this.broadcast("state", state);
  }

  broadcastSettings(settings: Settings): void {
    this.currentSettings = settings; // Store the current settings
    this.broadcast("settingsUpdate", settings);
  }

  broadcastWarning(message: string): void {
    this.broadcast("warning", { message });
  }

  broadcastError(message: string): void {
    this.broadcast("error", { message });
  }

  broadcastAnalysisResults(results: DetectionResponse): void {
    this.broadcast("analysis_results", results);
  }

  broadcastEjectionDecision(decision: boolean): void {
    this.broadcast("ejection_decision", { decision });
  }

  broadcastAnalysisImage(imageData: AnalysisImage): void {
    this.wss?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "analysis_image",
            data: imageData,
          })
        );
      }
    });
  }

  private broadcast(type: string, data: any): void {
    //@ts-ignore
    const message: WebSocketMessage = { type, data };
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  onCommand(callback: (command: Command) => void): void {
    this.wss.on("connection", (ws) => {
      ws.on("message", (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "command") {
            callback(data.data);
          }
        } catch (error) {
          console.error("Error parsing command message:", error);
          this.broadcastError("Invalid command format");
        }
      });
    });
  }

  onSettingsUpdate(callback: (settings: Partial<Settings>) => void): void {
    this.wss.on("connection", (ws) => {
      ws.on("message", (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "updateSettings") {
            callback(data.data);
          }
        } catch (error) {
          console.error("Error parsing settings update message:", error);
          this.broadcastError("Invalid settings format");
        }
      });
    });
  }

  onConnection(callback: (ws: WebSocket) => void): void {
    this.wss.on("connection", (ws) => {
      callback(ws);
      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        this.broadcastError("WebSocket connection error");
      });
    });
  }

  broadcastLog(
    message: string,
    level: "info" | "warn" | "error" = "info"
  ): void {
    const timestamp = new Date().toISOString();
    this.broadcast("log", {
      timestamp,
      message,
      level,
    });
  }

  getConnectedClientsCount(): number {
    return this.connectedClients;
  }
}
