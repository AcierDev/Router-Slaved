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

export type SettingsKeys = "sensorThreshold";

export type Command = "STATUS";
