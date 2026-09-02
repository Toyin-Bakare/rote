import {
  capabilitySchema,
  type Capability,
} from "../core/types.js";
import type { DiscoveryStep } from "../discovery/discovery-runner.js";

type ValueContract = Capability["inputs"][number];

export interface RecordingSpec {
  name: string;
  description: string;
  target: Capability["target"];
  inputs: ValueContract[];
  inputExamples: Record<string, string | number | boolean>;
  outputs: Capability["outputs"];
  success: Capability["success"];
  knownOutcomes?: Capability["knownOutcomes"];
  version?: number;
}

export class CapabilityRecorder {
  record(spec: RecordingSpec, discovery: DiscoveryStep[]): Capability {
    const completed = discovery.at(-1)?.goalComplete === true;
    if (!completed) throw new Error("Cannot record an incomplete discovery run");

    const steps = discovery.flatMap((entry, actionIndex) => {
      if (!entry.action) return [];
      return [{
        id: `step-${String(actionIndex + 1).padStart(2, "0")}`,
        description: entry.sanitizedReason,
        action: this.templateAction(entry.action, spec.inputExamples),
      }];
    });
    if (steps.length === 0) throw new Error("Cannot record a discovery run with no actions");

    return capabilitySchema.parse({
      schemaVersion: "1.0",
      name: spec.name,
      version: spec.version ?? 1,
      description: this.templateText(spec.description, spec.inputExamples),
      target: spec.target,
      inputs: spec.inputs,
      outputs: spec.outputs,
      steps,
      success: spec.success,
      knownOutcomes: spec.knownOutcomes ?? [],
    });
  }

  private templateAction(
    action: DiscoveryStep["action"] & object,
    examples: RecordingSpec["inputExamples"],
  ): NonNullable<DiscoveryStep["action"]> {
    let serialized = JSON.stringify(action);
    for (const [name, example] of Object.entries(examples)) {
      const encoded = JSON.stringify(String(example)).slice(1, -1);
      serialized = serialized.replaceAll(encoded, `{{${name}}}`);
    }
    return JSON.parse(serialized) as NonNullable<DiscoveryStep["action"]>;
  }

  private templateText(text: string, examples: RecordingSpec["inputExamples"]): string {
    return Object.entries(examples).reduce(
      (result, [name, example]) => result.replaceAll(String(example), `{{${name}}}`),
      text,
    );
  }
}
