import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { DiscoveryModel, ModelDecision, SurfaceObservation } from "../core/contracts.js";
import { actionSchema } from "../core/types.js";

const apiControlSchema = z.object({
  role: z.string().min(1),
  accessibleName: z.string().min(1).nullable(),
  label: z.string().min(1).nullable(),
  text: z.string().min(1).nullable(),
  nearbyText: z.string().min(1).nullable(),
  frameCss: z.string().min(1).nullable(),
  fallbackCss: z.string().min(1).nullable(),
  robustnessRationale: z.string().min(1),
});

const apiActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: z.string().min(1) }),
  z.object({ type: z.literal("click"), control: apiControlSchema }),
  z.object({ type: z.literal("type"), control: apiControlSchema, value: z.string() }),
  z.object({ type: z.literal("wait"), milliseconds: z.number().int().positive().max(10_000) }),
]);

const decisionSchema = z.object({
  goalComplete: z.boolean(),
  sanitizedReason: z.string().min(1),
  action: apiActionSchema.nullable(),
  extractedOutputs: z.array(z.object({
    name: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean()]),
  })).nullable(),
});

export class OpenAIDiscoveryModel implements DiscoveryModel {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model = "gpt-5.6-terra",
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async decide(goal: string, observation: SurfaceObservation): Promise<ModelDecision> {
    const response = await this.client.responses.parse({
      model: this.model,
      instructions: [
        "You are discovering a UI workflow that will later become deterministic automation.",
        "Choose exactly one safe next action or mark the goal complete.",
        "Prefer accessible roles/names and labels over CSS. Never include secrets or raw PII in the reason.",
        "Controls may include valueState='empty' or valueState='set'. Never refill a set control; advance to the next unmet condition.",
        "Do not repeat an action whose effect is already visible in the current observation.",
      ].join(" "),
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: JSON.stringify({
            goal,
            observation: { ...observation, screenshotBase64: undefined },
          }) },
          ...(observation.screenshotBase64 ? [{
            type: "input_image" as const,
            image_url: `data:image/jpeg;base64,${observation.screenshotBase64}`,
            detail: "low" as const,
          }] : []),
        ],
      }],
      text: { format: zodTextFormat(decisionSchema, "ui_decision") },
    });

    if (!response.output_parsed) throw new Error("OpenAI returned no structured decision");
    const parsed = response.output_parsed;
    return {
      goalComplete: parsed.goalComplete,
      sanitizedReason: parsed.sanitizedReason,
      ...(parsed.action ? {
        action: actionSchema.parse(JSON.parse(JSON.stringify(parsed.action, (_key, value: unknown) =>
          value === null ? undefined : value,
        )) as unknown),
      } : {}),
      ...(parsed.extractedOutputs ? {
        extractedOutputs: Object.fromEntries(parsed.extractedOutputs.map(({ name, value }) => [name, value])),
      } : {}),
    };
  }
}
