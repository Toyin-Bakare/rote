import { describe, expect, it } from "vitest";
import { capabilitySchema } from "../src/core/types.js";

describe("capability schema", () => {
  it("accepts a typed and reviewable capability", () => {
    const capability = capabilitySchema.parse({
      schemaVersion: "1.0",
      name: "lookup-savings-balance",
      version: 1,
      description: "Look up a member and read the savings balance",
      target: { application: "ParaBank", entryUrl: "http://localhost:8080/parabank" },
      inputs: [{ name: "memberId", type: "string", description: "Synthetic member identifier" }],
      outputs: [{ name: "balance", type: "number", description: "Current savings balance" }],
      steps: [{
        id: "enter-member-id",
        description: "Enter member identifier",
        action: {
          type: "type",
          value: "{{memberId}}",
          control: { role: "textbox", label: "Member ID", robustnessRationale: "Semantic label" },
        },
      }],
      success: { kind: "text-visible", expected: "Available Balance" },
    });
    expect(capability.version).toBe(1);
  });

  it("accepts frame-scoped actions and deterministic visual extraction", () => {
    const capability = capabilitySchema.parse({
      schemaVersion: "1.0",
      name: "visual-account-balance",
      version: 1,
      description: "Read a canvas-rendered balance inside a frame",
      target: { application: "AltoroJ Challenge", entryUrl: "http://localhost:8083/altoromutual/" },
      inputs: [],
      outputs: [{
        name: "balance", type: "number", description: "Canvas balance",
        extraction: {
          kind: "visual-text-near-label", label: "Available balance",
          frameCss: "iframe[src=\"challengeAccount.jsp\"]", visualCss: "canvas",
        },
      }],
      steps: [{
        id: "inspect",
        description: "Inspect the selected account inside the legacy frame",
        action: {
          type: "click",
          control: {
            role: "button", accessibleName: "Inspect",
            frameCss: "iframe[src=\"challengeAccount.jsp\"]",
            robustnessRationale: "Stable frame source plus semantic button name",
          },
        },
      }],
      success: { kind: "visual-text-visible", expected: "Available balance" },
    });
    expect(capability.outputs[0]?.extraction?.kind).toBe("visual-text-near-label");
  });
});
