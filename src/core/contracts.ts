import type { Action, ControlDescriptor, OutputExtraction } from "./types.js";

export interface SurfaceObservation {
  url: string;
  title: string;
  visibleText: string;
  controls: ControlDescriptor[];
  dialog?: { type: string; message: string } | undefined;
  screenshotBase64?: string;
}

/** A richer, debuggable capture of the surface. Written on failure only. */
export interface SurfaceSnapshot {
  url: string;
  title: string;
  screenshotBase64: string;
  domHtml: string;
}

export interface SurfaceAdapter {
  observe(): Promise<SurfaceObservation>;
  snapshot(): Promise<SurfaceSnapshot>;
  execute(action: Action): Promise<void>;
  verify(kind: "text-visible" | "visual-text-visible" | "url-matches" | "control-visible" | "dialog-present", expected: string): Promise<boolean>;
  extract(source: OutputExtraction): Promise<string>;
}

export interface ModelDecision {
  action?: Action | undefined;
  goalComplete: boolean;
  sanitizedReason: string;
  extractedOutputs?: Record<string, unknown> | undefined;
}

export interface DiscoveryModel {
  decide(goal: string, observation: SurfaceObservation): Promise<ModelDecision>;
}
