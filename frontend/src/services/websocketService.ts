import {
  SlaveState,
  SlaveSettings,
  WebSocketMessage,
  AnalysisImage,
} from "../../../master/src/typings/types";

export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectInterval: number = 5000;
  private url: string;

  private stateListeners: ((state: SlaveState) => void)[] = [];
  private settingsListeners: ((settings: SlaveSettings) => void)[] = [];
  private warningListeners: ((message: string) => void)[] = [];
  private errorListeners: ((message: string) => void)[] = [];
  private imageListeners: ((image: AnalysisImage) => void)[] = [];
  private logListeners: ((log: {
    timestamp: string;
    message: string;
    level: string;
  }) => void)[] = [];

  constructor(url: string = "ws://localhost:8080") {
    this.url = url;
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("Connected to WebSocket server");
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        switch (message.type) {
          case "state":
            this.stateListeners.forEach((listener) =>
              listener(message.data as SlaveState)
            );
            break;
          case "settings":
            this.settingsListeners.forEach((listener) =>
              listener(message.data as SlaveSettings)
            );
            break;
          case "warning":
            this.warningListeners.forEach((listener) =>
              listener((message.data as { message: string }).message)
            );
            break;
          case "error":
            this.errorListeners.forEach((listener) =>
              listener((message.data as { message: string }).message)
            );
            break;
          case "analysis_image":
            const analysisImage = message.data as AnalysisImage;
            console.log("Received image data:", {
              timestamp: analysisImage.timestamp,
              imageDataLength: analysisImage.imageData?.length || 0,
              imageDataPrefix:
                analysisImage.imageData?.substring(0, 50) + "...",
            });
            this.imageListeners.forEach((listener) => listener(analysisImage));
            break;
          case "log":
            this.logListeners.forEach((listener) =>
              listener(
                message.data as {
                  timestamp: string;
                  message: string;
                  level: string;
                }
              )
            );
            break;
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    this.ws.onclose = () => {
      console.log("WebSocket connection closed. Reconnecting...");
      setTimeout(() => this.connect(), this.reconnectInterval);
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }

  sendCommand(command: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "command", data: command }));
    }
  }

  updateSettings(settings: Partial<SlaveSettings>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "updateSettings", data: settings }));
    }
  }

  onState(callback: (state: SlaveState) => void) {
    this.stateListeners.push(callback);
  }

  onSettings(callback: (settings: SlaveSettings) => void) {
    this.settingsListeners.push(callback);
  }

  onWarning(callback: (message: string) => void) {
    this.warningListeners.push(callback);
  }

  onError(callback: (message: string) => void) {
    this.errorListeners.push(callback);
  }

  onImage(callback: (image: AnalysisImage) => void) {
    this.imageListeners.push(callback);
  }

  onLog(
    callback: (log: {
      timestamp: string;
      message: string;
      level: string;
    }) => void
  ) {
    this.logListeners.push(callback);
  }

  removeLogListener(
    callback: (log: {
      timestamp: string;
      message: string;
      level: string;
    }) => void
  ) {
    this.logListeners = this.logListeners.filter(
      (listener) => listener !== callback
    );
  }
}
