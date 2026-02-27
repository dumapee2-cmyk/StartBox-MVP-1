export type ProgressEventType =
  | "status"
  | "plan"
  | "writing"
  | "created"
  | "quality"
  | "done"
  | "error";

export interface ProgressEvent {
  type: ProgressEventType;
  message: string;
  data?: Record<string, unknown>;
}

export type ProgressCallback = (event: ProgressEvent) => void;
