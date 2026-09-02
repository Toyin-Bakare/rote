import type { DiscoveryModel, SurfaceAdapter } from "../core/contracts.js";
import type { Action } from "../core/types.js";
import { Actuator } from "../safety/actuator.js";

export interface DiscoveryStep {
  index: number;
  action?: Action | undefined;
  sanitizedReason: string;
  goalComplete: boolean;
  extractedOutputs?: Record<string, unknown> | undefined;
}

export class DiscoveryRunner {
  constructor(
    private readonly surface: SurfaceAdapter,
    private readonly actuator: Actuator,
    private readonly model: DiscoveryModel,
  ) {}

  async run(
    goal: string,
    maxSteps = 12,
    onStep?: (step: DiscoveryStep) => void,
    timeoutMs = 120_000,
  ): Promise<DiscoveryStep[]> {
    const evidence: DiscoveryStep[] = [];
    const startedAt = Date.now();
    let previousFingerprint = "";
    let repeatedState = 0;
    for (let index = 0; index < maxSteps; index += 1) {
      if (Date.now() - startedAt >= timeoutMs) throw new Error(`Discovery stopped after timeoutMs=${timeoutMs}`);
      const observation = await this.surface.observe();
      const decision = await this.model.decide(goal, observation);
      const fingerprint = JSON.stringify({
        url: observation.url,
        title: observation.title,
        text: observation.visibleText.slice(0, 1200),
        action: decision.action ?? null,
      });
      repeatedState = fingerprint === previousFingerprint ? repeatedState + 1 : 0;
      previousFingerprint = fingerprint;
      if (repeatedState >= 2) throw new Error("Discovery stopped: dead-end detected (same observation and action repeated)");
      const step: DiscoveryStep = {
        index,
        action: decision.action,
        sanitizedReason: decision.sanitizedReason,
        goalComplete: decision.goalComplete,
        extractedOutputs: decision.extractedOutputs,
      };
      evidence.push(step);
      onStep?.(step);
      if (decision.goalComplete) return evidence;
      if (!decision.action) throw new Error("Model did not provide an action before goal completion");
      await this.actuator.execute(decision.action);
    }
    throw new Error(`Discovery stopped after maxSteps=${maxSteps}`);
  }
}
