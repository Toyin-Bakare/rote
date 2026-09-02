import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CapabilityRecorder } from "../src/capability/recorder.js";
import { CapabilityRepository } from "../src/capability/repository.js";

describe("capability recording", () => {
  it("normalizes a completed discovery and replaces example values with templates", () => {
    const capability = new CapabilityRecorder().record({
      name: "lookup-savings-balance",
      description: "Look up a synthetic member balance",
      target: { application: "ParaBank", entryUrl: "http://localhost:8080/parabank/" },
      inputs: [{ name: "memberId", type: "string", description: "Synthetic member identifier", required: true, sensitive: false }],
      inputExamples: { memberId: "12345" },
      outputs: [{ name: "balance", type: "number", description: "Current balance", required: true, sensitive: false }],
      success: { kind: "text-visible", expected: "Available Balance" },
    }, [{
      index: 0,
      goalComplete: false,
      sanitizedReason: "Enter the synthetic member identifier",
      action: {
        type: "type",
        value: "12345",
        control: { role: "textbox", label: "Member ID", robustnessRationale: "Stable visible label" },
      },
    }, {
      index: 1,
      goalComplete: true,
      sanitizedReason: "Balance was observed",
      extractedOutputs: { balance: 500.25 },
    }]);

    expect(capability.steps[0]?.action).toMatchObject({ type: "type", value: "{{memberId}}" });
  });

  it("refuses to record an incomplete discovery", () => {
    expect(() => new CapabilityRecorder().record({
      name: "incomplete",
      description: "Incomplete run",
      target: { application: "ParaBank", entryUrl: "http://localhost:8080/parabank/" },
      inputs: [], inputExamples: {}, outputs: [],
      success: { kind: "text-visible", expected: "Done" },
    }, [{ index: 0, goalComplete: false, sanitizedReason: "Still working" }])).toThrow("incomplete");
  });

  it("round-trips a validated versioned artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "rote-capabilities-"));
    const repository = new CapabilityRepository(root);
    const capability = {
      schemaVersion: "1.0", name: "sample", version: 1, description: "Sample capability",
      target: { application: "ParaBank", entryUrl: "http://localhost:8080/parabank/" },
      inputs: [], outputs: [],
      steps: [{ id: "step-01", description: "Open target", action: { type: "navigate", url: "http://localhost:8080/parabank/" } }],
      success: { kind: "text-visible", expected: "Customer Login" }, knownOutcomes: [],
    };
    const path = await repository.save(capability);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ name: "sample", version: 1 });
    expect(await repository.load("sample", 1)).toEqual(capability);
  });
});
