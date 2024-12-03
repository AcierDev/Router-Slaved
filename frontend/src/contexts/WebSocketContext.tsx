import React, { createContext, useContext, useEffect, useState } from "react";
import { WebSocketService } from "../services/websocketService";
import {
  SlaveState,
  SlaveSettings,
  AnalysisImage,
} from "../../../master/src/typings/types";

interface WebSocketContextType {
  state: SlaveState | null;
  settings: SlaveSettings | null;
  latestImage: AnalysisImage | null;
  sendCommand: (command: string) => void;
  updateSettings: (settings: Partial<SlaveSettings>) => void;
  ws: WebSocketService;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [ws] = useState(() => new WebSocketService());
  const [state, setState] = useState<SlaveState | null>(null);
  const [settings, setSettings] = useState<SlaveSettings | null>(null);
  const [latestImage, setLatestImage] = useState<AnalysisImage | null>(null);

  useEffect(() => {
    ws.onState(setState);
    ws.onSettings(setSettings);
    ws.onImage(setLatestImage);
    ws.onWarning((message) => console.warn(message));
    ws.onError((message) => console.error(message));
  }, [ws]);

  return (
    <WebSocketContext.Provider
      value={{
        state,
        settings,
        latestImage,
        sendCommand: (command) => ws.sendCommand(command),
        updateSettings: (settings) => ws.updateSettings(settings),
        ws,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
};
