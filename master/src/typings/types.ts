export interface SlaveState {
  status: string;
  router_state: RouterState;
  push_cylinder: "ON" | "OFF";
  riser_cylinder: "ON" | "OFF";
  ejection_cylinder: "ON" | "OFF";
  sensor1: "ON" | "OFF";
}

export enum RouterState {
  IDLE,
  WAITING_FOR_PUSH,
  PUSHING,
  RAISING,
  WAITING_FOR_ANALYSIS,
  EJECTING,
  LOWERING,
  ERROR,
}

export type State = "IDLE";

export type SlaveSettings = {
  pushTime: number;
  riserTime: number;
};

export type EjectionSettings = {
  confidenceThreshold: number; // Minimum confidence level to consider a detection valid
  maxDefects: number; // Maximum number of defects allowed before rejection
  minArea: number; // Minimum area size to consider for analysis
  maxArea: number; // Maximum area size to consider for analysis
};

export type Settings = {
  slave: SlaveSettings;
  ejection: EjectionSettings;
};

export type SettingsKeys = "sensorThreshold";

export type Command =
  | "STATUS"
  | "ANALYSIS_RESULT TRUE"
  | "ANALYSIS_RESULT FALSE"
  | "ABORT_ANALYSIS";

export interface AnalysisImage {
  timestamp: string;
  imageData: string; // Base64 encoded image
  path: string;
}

export interface WebSocketMessage {
  type: "state" | "settings" | "warning" | "error" | "analysis_image" | "log";
  data: SlaveState | Settings | { message: string } | AnalysisImage;
}

export interface ExtendedState extends SlaveState {
  isCapturing: boolean;
  isAnalyzing: boolean;
}
