export interface SlaveState {
  status: string;
  router_state: RouterState;
  push_cylinder: "ON" | "OFF";
  riser_cylinder: "ON" | "OFF";
  ejection_cylinder: "ON" | "OFF";
  sensor1: "ON" | "OFF";
}

export interface ExtendedState extends SlaveState {
  isCapturing: boolean;
  isAnalyzing: boolean;
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

export type ClassName =
  | "corner"
  | "crack"
  | "damage"
  | "edge"
  | "knot"
  | "router"
  | "side"
  | "tearout";

export interface FileInfo {
  original_filename: string;
  stored_locations: {
    count_based: string;
    defect_types: string[];
  };
}

export interface BoundingBox {
  0: number; // x1
  1: number; // y1
  2: number; // x2
  3: number; // y2
}

export interface Prediction {
  bbox: BoundingBox;
  class_name: ClassName;
  confidence: number;
  detection_id: string;
}

export interface DetectionResponse {
  data: {
    file_info: FileInfo;
    predictions: Prediction[];
  };
  success: boolean;
  timestamp: string;
  processingTime: number;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GlobalSettings {
  requireMultipleDefects: boolean;
  minTotalArea: number;
  maxDefectsBeforeEject: number;
}

export type PerClassSettings = {
  [className in ClassName]: {
    enabled: boolean;
    minConfidence: number;
    minArea: number;
    maxCount: number;
  };
};

export interface AdvancedSettings {
  considerOverlap: boolean;
  regionOfInterest: Region;
  exclusionZones: Region[];
}

export interface EjectionSettings {
  globalSettings: GlobalSettings;
  perClassSettings: PerClassSettings;
  advancedSettings: AdvancedSettings;
}

export type SlaveSettings = {
  pushTime: number;
  riserTime: number;
  ejectionTime: number;
  analysisMode: boolean;
};

export type Settings = {
  slave: SlaveSettings;
  ejection: EjectionSettings;
};
