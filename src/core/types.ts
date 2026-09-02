import { z } from "zod";

export const scalarTypeSchema = z.enum(["string", "number", "boolean"]);

export const valueContractSchema = z.object({
  name: z.string().min(1),
  type: scalarTypeSchema,
  description: z.string().min(1),
  required: z.boolean().default(true),
  sensitive: z.boolean().default(false),
});

export const outputExtractionSchema = z.object({
  kind: z.enum(["text-near-label", "visual-text-near-label"]),
  label: z.string().min(1),
  frameCss: z.string().min(1).optional(),
  visualCss: z.string().min(1).optional(),
});

export const outputContractSchema = valueContractSchema.extend({
  extraction: outputExtractionSchema.optional(),
});

export const controlDescriptorSchema = z.object({
  role: z.string().min(1),
  accessibleName: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  nearbyText: z.string().min(1).optional(),
  valueState: z.enum(["empty", "set"]).optional(),
  frameCss: z.string().min(1).optional(),
  fallbackCss: z.string().min(1).optional(),
  robustnessRationale: z.string().min(1),
}).refine(
  (value) => Boolean(value.accessibleName ?? value.label ?? value.text ?? value.fallbackCss),
  "A control needs at least one locator signal",
);

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: z.string().url() }),
  z.object({ type: z.literal("click"), control: controlDescriptorSchema }),
  z.object({
    type: z.literal("type"),
    control: controlDescriptorSchema,
    value: z.string(),
  }),
  z.object({ type: z.literal("wait"), milliseconds: z.number().int().positive().max(10_000) }),
]);

export const checkpointSchema = z.object({
  kind: z.enum(["text-visible", "visual-text-visible", "url-matches", "control-visible", "dialog-present"]),
  expected: z.string().min(1),
});

export const capabilityStepSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  action: actionSchema,
  checkpoint: checkpointSchema.optional(),
});

/**
 * A recovery is the declared, bounded response to a recoverable condition.
 * It is data in the artifact, not a decision made at run time, so replay stays
 * deterministic: the same interstitial is always answered by the same action.
 */
export const recoverySchema = z.object({
  action: actionSchema,
  maxAttempts: z.number().int().positive().max(5).default(2),
  settleMs: z.number().int().nonnegative().max(10_000).default(500),
});

export const knownOutcomeSchema = z.object({
  code: z.string().min(1),
  resultType: z.enum(["business_outcome", "recoverable", "blocked"]),
  checkpoint: checkpointSchema,
  description: z.string().min(1),
  recovery: recoverySchema.optional(),
}).refine(
  (value) => value.resultType !== "recoverable" || value.recovery !== undefined,
  "A recoverable outcome must declare a recovery action",
);

export const capabilitySchema = z.object({
  schemaVersion: z.literal("1.0"),
  name: z.string().regex(/^[a-z0-9-]+$/),
  version: z.number().int().positive(),
  description: z.string().min(1),
  target: z.object({
    application: z.string().min(1),
    entryUrl: z.string().url(),
  }),
  inputs: z.array(valueContractSchema),
  outputs: z.array(outputContractSchema),
  steps: z.array(capabilityStepSchema).min(1),
  success: checkpointSchema,
  knownOutcomes: z.array(knownOutcomeSchema).default([]),
});

export type Action = z.infer<typeof actionSchema>;
export type Capability = z.infer<typeof capabilitySchema>;
export type ControlDescriptor = z.infer<typeof controlDescriptorSchema>;
export type OutputExtraction = z.infer<typeof outputExtractionSchema>;
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type KnownOutcome = z.infer<typeof knownOutcomeSchema>;

/** One recoverable condition that was met, answered, and cleared during a run. */
export interface RecoveryRecord {
  code: string;
  attempts: number;
  detail: string;
}

export type RunResult =
  | { status: "success"; outputs: Record<string, unknown>; recoveries?: RecoveryRecord[] }
  | { status: "business_outcome"; code: string; detail: string; recoveries?: RecoveryRecord[] }
  | {
      status: "blocked";
      stepId: string;
      /** Index to resume from after a human clears the condition. */
      stepIndex: number;
      errorCode: string;
      expected: string;
      observed: string;
      recoveries?: RecoveryRecord[];
      evidenceRef?: string;
    };
