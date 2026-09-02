import { describe, expect, it, vi } from "vitest";
import { HandoffCoordinator, type HandoffRequest } from "../src/session/handoff-coordinator.js";
import { SessionLease } from "../src/session/session-lease.js";

const request: HandoffRequest = {
  capability: "capabilities/altoroj-challenge-account-balance/v2.json",
  goal: "Read the available balance for the requested synthetic account",
  code: "HUMAN_INTERVENTION_REQUIRED",
  reason: "Operator verification required",
  stepId: "final-checkpoint",
  stepIndex: 7,
  observed: "Matched text-visible checkpoint 'Operator Verification Required'",
  resolutionCheckpoint: "Operator Verification Required",
  evidenceRef: "evidence/failures/run-1/final-checkpoint-human-intervention-required",
};

describe("intervention request", () => {
  it("carries capability, goal, step, state and stop reason", () => {
    expect(HandoffCoordinator.describe(request)).toEqual({
      capability: request.capability,
      goal: request.goal,
      code: request.code,
      reason: request.reason,
      stoppedAtStep: { id: "final-checkpoint", index: 7 },
      observed: request.observed,
      resolutionCheckpoint: request.resolutionCheckpoint,
      evidenceRef: request.evidenceRef,
    });
  });
});

describe("same-session human handoff", () => {
  it("transfers control, records the human action, and resumes automation", async () => {
    const lease = new SessionLease();
    const coordinator = new HandoffCoordinator(lease);
    const operator = vi.fn().mockResolvedValue(undefined);
    await coordinator.run(request, operator, vi.fn().mockResolvedValue(true));

    expect(operator).toHaveBeenCalledOnce();
    expect(() => lease.assertAutomationControl()).not.toThrow();
    expect(lease.snapshot().timeline.map((entry) => [entry.actor, entry.event])).toEqual([
      ["automation", "run-started"],
      ["automation", "paused"],
      ["human", "control-transferred"],
      ["human", "action"],
      ["automation", "control-transferred"],
      ["automation", "resumed"],
    ]);
  });

  it("records the stopping step and the human action in the timeline", async () => {
    const lease = new SessionLease();
    await new HandoffCoordinator(lease).run(request, vi.fn().mockResolvedValue(undefined), vi.fn().mockResolvedValue(true));
    const details = lease.snapshot().timeline.map((entry) => entry.detail).join(" | ");
    expect(details).toContain("final-checkpoint");
    expect(details).toContain("Operator resolved");
  });

  it("does not return control when the operator condition remains", async () => {
    const lease = new SessionLease();
    const coordinator = new HandoffCoordinator(lease);
    await expect(coordinator.run(request, vi.fn().mockResolvedValue(undefined), vi.fn().mockResolvedValue(false)))
      .rejects.toThrow("did not clear");
    expect(lease.snapshot()).toMatchObject({ owner: "human", paused: true });
    expect(() => lease.assertAutomationControl()).toThrow("does not hold");
  });
});
