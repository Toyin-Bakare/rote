import type { SurfaceAdapter } from "../core/contracts.js";
import type { Action } from "../core/types.js";
import { evaluateAction, type Policy } from "./policy.js";

export interface AutomationAuthority {
  assertAutomationControl(): void;
}

export class PolicyViolation extends Error {}

export class Actuator {
  constructor(
    private readonly surface: SurfaceAdapter,
    private readonly policy: Policy,
    private readonly authority?: AutomationAuthority,
  ) {}

  async execute(action: Action): Promise<void> {
    this.authority?.assertAutomationControl();
    const decision = evaluateAction(this.policy, action);
    if (!decision.allowed) throw new PolicyViolation(decision.reason);
    await this.surface.execute(action);
  }
}
