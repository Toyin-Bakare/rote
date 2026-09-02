import type { SurfaceAdapter } from "../core/contracts.js";
import type { FailureEvidence } from "../evidence/failure-evidence.js";
import {
  capabilitySchema,
  type Capability,
  type Checkpoint,
  type KnownOutcome,
  type RecoveryRecord,
  type RunResult,
} from "../core/types.js";
import { Actuator } from "../safety/actuator.js";

export interface ReplayOptions {
  evidence?: FailureEvidence;
  runId?: string;
}

interface BlockedFields {
  stepId: string;
  stepIndex: number;
  errorCode: string;
  expected: string;
  observed: string;
}

export class ReplayEngine {
  private readonly evidence: FailureEvidence | undefined;
  private readonly runId: string;
  private redactValues: string[] = [];

  constructor(
    private readonly surface: SurfaceAdapter,
    private readonly actuator: Actuator,
    options: ReplayOptions = {},
  ) {
    this.evidence = options.evidence;
    this.runId = options.runId ?? `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  }

  /** Full run: navigate to the entry point, then execute every step. */
  async run(rawCapability: unknown, inputs: Record<string, unknown>): Promise<RunResult> {
    const capability = this.prepare(rawCapability, inputs);

    try {
      await this.actuator.execute({ type: "navigate", url: capability.target.entryUrl });
    } catch (error) {
      return this.blocked({
        stepId: "target-navigation",
        stepIndex: 0,
        errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
        expected: capability.target.entryUrl,
        observed: error instanceof Error ? error.message : String(error),
      }, []);
    }

    return this.executeFrom(capability, inputs, 0, []);
  }

  /**
   * Continue an already-open session from a given step index. Used after a
   * human handoff: the session is live and mid-flow, so we must not navigate
   * back to the entry point or repeat completed steps.
   */
  async resume(
    rawCapability: unknown,
    inputs: Record<string, unknown>,
    fromStepIndex: number,
    recoveries: RecoveryRecord[] = [],
  ): Promise<RunResult> {
    const capability = this.prepare(rawCapability, inputs);
    const start = Math.min(Math.max(fromStepIndex, 0), capability.steps.length);
    return this.executeFrom(capability, inputs, start, recoveries);
  }

  private prepare(rawCapability: unknown, inputs: Record<string, unknown>): Capability {
    const capability: Capability = capabilitySchema.parse(rawCapability);
    this.validateInputs(capability, inputs);
    this.redactValues = capability.inputs
      .filter((input) => input.sensitive)
      .map((input) => String(inputs[input.name] ?? ""))
      .filter(Boolean);
    return capability;
  }

  private async executeFrom(
    capability: Capability,
    inputs: Record<string, unknown>,
    startIndex: number,
    recoveries: RecoveryRecord[],
  ): Promise<RunResult> {
    for (let index = startIndex; index < capability.steps.length; index += 1) {
      const step = capability.steps[index];
      if (!step) continue;
      const action = this.interpolate(step.action, inputs);
      try {
        await this.actuator.execute(action);
      } catch (error) {
        return this.blocked({
          stepId: step.id,
          stepIndex: index,
          errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
          expected: step.description,
          observed: error instanceof Error ? error.message : String(error),
        }, recoveries);
      }

      // A recoverable condition can appear at any point in the flow, so it is
      // answered here rather than only at the end.
      const recoveryFailure = await this.applyRecoveries(capability, index, step.id, recoveries);
      if (recoveryFailure) return recoveryFailure;

      if (step.checkpoint) {
        const valid = await this.verify(step.checkpoint);
        if (!valid) {
          return this.blocked({
            stepId: step.id,
            stepIndex: index,
            errorCode: "CHECKPOINT_FAILED",
            expected: step.checkpoint.expected,
            observed: await this.describeObserved(),
          }, recoveries);
        }
      }
    }

    return this.finalize(capability, recoveries);
  }

  private async finalize(capability: Capability, recoveries: RecoveryRecord[]): Promise<RunResult> {
    const finalIndex = capability.steps.length;

    const recoveryFailure = await this.applyRecoveries(capability, finalIndex, "final-checkpoint", recoveries);
    if (recoveryFailure) return recoveryFailure;

    const terminal = await this.matchOutcome(
      capability.knownOutcomes.filter((outcome) => outcome.resultType !== "recoverable"),
    );
    if (terminal) return this.outcomeResult(terminal, finalIndex, recoveries);

    const success = await this.verify(capability.success);
    if (!success) {
      return this.blocked({
        stepId: "success-checkpoint",
        stepIndex: finalIndex,
        errorCode: "SUCCESS_CHECKPOINT_FAILED",
        expected: capability.success.expected,
        observed: await this.describeObserved(),
      }, recoveries);
    }

    const outputs: Record<string, unknown> = {};
    for (const output of capability.outputs) {
      if (!output.extraction) {
        if (!output.required) continue;
        return this.blocked({
          stepId: `output-${output.name}`,
          stepIndex: finalIndex,
          errorCode: "OUTPUT_EXTRACTION_NOT_CONFIGURED",
          expected: `Extraction rule for required ${output.type} output '${output.name}'`,
          observed: "Capability has no extraction rule",
        }, recoveries);
      }
      try {
        const raw = await this.surface.extract(output.extraction);
        outputs[output.name] = this.normalizeOutput(raw, output.type);
      } catch (error) {
        return this.blocked({
          stepId: `output-${output.name}`,
          stepIndex: finalIndex,
          errorCode: "OUTPUT_EXTRACTION_FAILED",
          expected: `${output.type} value near '${output.extraction.label}'`,
          observed: error instanceof Error ? error.message : String(error),
        }, recoveries);
      }
    }
    return recoveries.length > 0
      ? { status: "success", outputs, recoveries: [...recoveries] }
      : { status: "success", outputs };
  }

  /**
   * Answer every declared recoverable condition that is currently on screen.
   * Bounded by the artifact's own maxAttempts: exhausting it is a hard failure,
   * never an open-ended retry loop.
   */
  private async applyRecoveries(
    capability: Capability,
    stepIndex: number,
    stepId: string,
    recoveries: RecoveryRecord[],
  ): Promise<RunResult | undefined> {
    const recoverable = capability.knownOutcomes.filter((outcome) => outcome.resultType === "recoverable");
    if (recoverable.length === 0) return undefined;

    const totalBudget = recoverable.reduce((sum, outcome) => sum + (outcome.recovery?.maxAttempts ?? 1), 0);
    for (let pass = 0; pass <= totalBudget; pass += 1) {
      const match = await this.matchOutcome(recoverable);
      if (!match || !match.recovery) return undefined;

      const record = recoveries.find((entry) => entry.code === match.code);
      const attempts = (record?.attempts ?? 0) + 1;
      if (attempts > match.recovery.maxAttempts) {
        return this.blocked({
          stepId,
          stepIndex,
          errorCode: "RECOVERY_EXHAUSTED",
          expected: `'${match.code}' cleared within ${match.recovery.maxAttempts} attempt(s)`,
          observed: `'${match.code}' was still present after ${match.recovery.maxAttempts} attempt(s)`,
        }, recoveries);
      }

      try {
        await this.actuator.execute(match.recovery.action);
      } catch (error) {
        return this.blocked({
          stepId,
          stepIndex,
          errorCode: "RECOVERY_ACTION_FAILED",
          expected: match.description,
          observed: error instanceof Error ? error.message : String(error),
        }, recoveries);
      }

      if (match.recovery.settleMs > 0) {
        await this.actuator.execute({ type: "wait", milliseconds: match.recovery.settleMs });
      }

      if (record) {
        record.attempts = attempts;
      } else {
        recoveries.push({ code: match.code, attempts, detail: match.description });
      }
    }

    return undefined;
  }

  private async blocked(fields: BlockedFields, recoveries: RecoveryRecord[]): Promise<RunResult> {
    const evidenceRef = await this.evidence?.capture({
      runId: this.runId,
      stepId: fields.stepId,
      errorCode: fields.errorCode,
      redactValues: this.redactValues,
    }, this.surface);

    return {
      status: "blocked",
      ...fields,
      ...(recoveries.length > 0 ? { recoveries: [...recoveries] } : {}),
      ...(evidenceRef ? { evidenceRef } : {}),
    };
  }

  private async describeObserved(): Promise<string> {
    try {
      const observation = await this.surface.observe();
      return `${observation.title} | ${observation.url} | ${observation.visibleText.slice(0, 500)}`;
    } catch (error) {
      return `Observation failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private verify(checkpoint: Checkpoint): Promise<boolean> {
    return this.surface.verify(checkpoint.kind, checkpoint.expected);
  }

  private validateInputs(capability: Capability, inputs: Record<string, unknown>): void {
    for (const input of capability.inputs) {
      const value = inputs[input.name];
      if (input.required && value === undefined) throw new Error(`Missing required input '${input.name}'`);
      if (value !== undefined && typeof value !== input.type) {
        throw new Error(`Input '${input.name}' must be ${input.type}`);
      }
    }
  }

  private interpolate(action: Capability["steps"][number]["action"], inputs: Record<string, unknown>) {
    const serialized = JSON.stringify(action).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => {
      const value = inputs[key];
      if (value === undefined) throw new Error(`Missing template value '${key}'`);
      return String(value).replaceAll('"', '\\"');
    });
    return JSON.parse(serialized) as Capability["steps"][number]["action"];
  }

  private normalizeOutput(raw: string, type: Capability["outputs"][number]["type"]): string | number | boolean {
    const value = raw.trim();
    if (type === "string") return value;
    if (type === "boolean") {
      if (/^true$/i.test(value)) return true;
      if (/^false$/i.test(value)) return false;
      throw new Error(`'${value}' is not a boolean`);
    }
    const parenthesized = /^\(.*\)$/.test(value);
    const normalized = value.replaceAll(",", "").replaceAll("$", "").replace(/[()\s]/g, "");
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) throw new Error(`'${value}' is not a number`);
    const number = Number(normalized) * (parenthesized ? -1 : 1);
    if (!Number.isFinite(number)) throw new Error(`'${value}' is not a finite number`);
    return number;
  }

  private async matchOutcome(outcomes: KnownOutcome[]): Promise<KnownOutcome | undefined> {
    for (const outcome of outcomes) {
      if (await this.verify(outcome.checkpoint)) return outcome;
    }
    return undefined;
  }

  private async outcomeResult(
    outcome: KnownOutcome,
    stepIndex: number,
    recoveries: RecoveryRecord[],
  ): Promise<RunResult> {
    if (outcome.resultType === "business_outcome") {
      return {
        status: "business_outcome",
        code: outcome.code,
        detail: outcome.description,
        ...(recoveries.length > 0 ? { recoveries: [...recoveries] } : {}),
      };
    }
    return this.blocked({
      stepId: "final-checkpoint",
      stepIndex,
      errorCode: outcome.code,
      expected: outcome.description,
      observed: `Matched ${outcome.checkpoint.kind} checkpoint '${outcome.checkpoint.expected}'`,
    }, recoveries);
  }
}
