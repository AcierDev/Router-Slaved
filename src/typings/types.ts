export interface SlaveState {
  status: State;
  sensors: Record<string, boolean>;
}

export type State = "IDLE";

export interface SlaveSettings {}

export type Command = string;
