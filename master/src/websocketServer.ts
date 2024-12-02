import { WebSocket, WebSocketServer as WSServer } from "ws";
import { Command, SlaveSettings, SlaveState } from "./typings/types";

export class WebSocketServer {
  private wss: WSServer;

  constructor(port: number) {
    this.wss = new WSServer({ port });
  }

  broadcastState(state: SlaveState): void {
    this.broadcast("state", state);
  }

  broadcastSettings(settings: SlaveSettings): void {
    this.broadcast("settings", settings);
  }

  broadcastWarning(message: string): void {
    this.broadcast("warning", { message });
  }

  broadcastError(message: string): void {
    this.broadcast("error", { message });
  }

  private broadcast(type: string, data: any): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type, data }));
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

  onSettingsUpdate(callback: (settings: Partial<SlaveSettings>) => void): void {
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
}
