export interface SlaveState {
  status: string;
  router_state: number;
  push_cylinder: "ON" | "OFF";
  riser_cylinder: "ON" | "OFF";
  sensor1: boolean;
}

export type State = "IDLE";

export type SlaveSettings = {
  pushTime: number;
  riserTime: number;
};

export type SettingsKeys = "sensorThreshold";

export type Command = "STATUS";
