import { SessionLease } from "./session-lease.js";

/**
 * Everything an operator needs to act on the intervention without opening the
 * code: which capability and goal, where the run stopped, what was on screen,
 * and why automation stopped.
 */
export interface HandoffRequest {
  capability: string;
  goal: string;
  code: string;
  reason: string;
  stepId: string;
  stepIndex: number;
  observed: string;
  resolutionCheckpoint: string;
  evidenceRef?: string | undefined;
}

export class HandoffCoordinator {
  constructor(private readonly lease: SessionLease) {}

  /** The request as it is routed to an operator and written to evidence. */
  static describe(request: HandoffRequest): Record<string, unknown> {
    return {
      capability: request.capability,
      goal: request.goal,
      code: request.code,
      reason: request.reason,
      stoppedAtStep: { id: request.stepId, index: request.stepIndex },
      observed: request.observed,
      resolutionCheckpoint: request.resolutionCheckpoint,
      ...(request.evidenceRef ? { evidenceRef: request.evidenceRef } : {}),
    };
  }

  async run(
    request: HandoffRequest,
    operatorAction: () => Promise<void>,
    isResolved: () => Promise<boolean>,
  ): Promise<void> {
    this.lease.pause(`${request.code}: ${request.reason} (step ${request.stepId} #${request.stepIndex})`);
    this.lease.transferToHuman(
      `Operator took control of the same live session at step ${request.stepId}` +
      `${request.evidenceRef ? `; context ${request.evidenceRef}` : ""}`,
    );
    await operatorAction();
    this.lease.recordHumanAction(`Operator resolved '${request.resolutionCheckpoint}' in the live session`);
    if (!await isResolved()) throw new Error(`Human handoff did not clear '${request.resolutionCheckpoint}'`);
    this.lease.returnToAutomation("Operator returned the live session after resolving the condition");
    this.lease.resume();
  }
}
