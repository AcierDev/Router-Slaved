import WebSocket from "ws";
import { Command, SlaveSettings, SlaveState } from "./typings/types";

export class WebSocketServer {
  private wss: WebSocket.Server;

  constructor(port: number) {
    this.wss = new WebSocket.Server({ port });
  }

  broadcastState(state: SlaveState): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "state", data: state }));
      }
    });
  }

  broadcastSettings(settings: SlaveSettings): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "settings", data: settings }));
      }
    });
  }

  onCommand(callback: (command: Command) => void): void {
    this.wss.on("connection", (ws) => {
      ws.on("message", (message: string) => {
        const data = JSON.parse(message);
        if (data.type === "command") {
          callback(data.data);
        }
      });
    });
  }

  onSettingsUpdate(callback: (settings: Partial<SlaveSettings>) => void): void {
    this.wss.on("connection", (ws) => {
      ws.on("message", (message: string) => {
        const data = JSON.parse(message);
        if (data.type === "updateSettings") {
          callback(data.data);
        }
      });
    });
  }
}
