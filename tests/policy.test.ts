import { describe, expect, it } from "vitest";
import { evaluateAction, type Policy } from "../src/safety/policy.js";

const policy: Policy = {
  allowedHosts: ["localhost:8080"],
  allowedRoutePrefixes: ["/parabank"],
  allowedActions: ["navigate", "click", "type", "wait"],
  riskyControlPattern: "open|transfer|submit|confirm|delete",
};

describe("policy", () => {
  it("blocks navigation outside the host allowlist", () => {
    expect(evaluateAction(policy, { type: "navigate", url: "https://example.com" }).allowed).toBe(false);
  });

  it("blocks risky controls", () => {
    const result = evaluateAction(policy, {
      type: "click",
      control: { role: "button", accessibleName: "Open New Account", robustnessRationale: "Role and name" },
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks navigation outside the route allowlist", () => {
    const result = evaluateAction(policy, { type: "navigate", url: "http://localhost:8080/admin" });
    expect(result).toMatchObject({ allowed: false });
  });

  it("allows navigation inside the allowed route", () => {
    expect(evaluateAction(policy, { type: "navigate", url: "http://localhost:8080/parabank/index.htm" }))
      .toEqual({ allowed: true, risk: "reversible" });
  });

  it("allows reversible typing", () => {
    const result = evaluateAction(policy, {
      type: "type",
      value: "{{memberId}}",
      control: { role: "textbox", label: "Member ID", robustnessRationale: "Label survives layout changes" },
    });
    expect(result).toEqual({ allowed: true, risk: "reversible" });
  });
});

