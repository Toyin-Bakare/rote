import { describe, expect, it, vi } from "vitest";
import type { SurfaceAdapter } from "../src/core/contracts.js";
import { ReplayEngine } from "../src/replay/replay-engine.js";
import { Actuator } from "../src/safety/actuator.js";
import type { Policy } from "../src/safety/policy.js";

function capability() {
  return {
    schemaVersion: "1.0", name: "extract-balance", version: 1, description: "Extract a balance",
    target: { application: "ParaBank", entryUrl: "http://localhost:8080/parabank/" },
    inputs: [],
    outputs: [{
      name: "balance", type: "number", description: "Available balance", required: true, sensitive: false,
      extraction: { kind: "text-near-label", label: "Available:" },
    }],
    steps: [{ id: "wait", description: "Wait for details", action: { type: "wait", milliseconds: 1 } }],
    success: { kind: "text-visible", expected: "Available:" }, knownOutcomes: [],
  };
}

function surface(raw: string): SurfaceAdapter {
  return {
    observe: vi.fn().mockResolvedValue({ url: "http://localhost:8080", title: "ParaBank", visibleText: "Available:", controls: [] }),
    snapshot: vi.fn().mockResolvedValue({
      url: "http://localhost:8080", title: "ParaBank", screenshotBase64: "", domHtml: "<html></html>",
    }),
    execute: vi.fn().mockResolvedValue(undefined),
    verify: vi.fn().mockResolvedValue(true),
    extract: vi.fn().mockResolvedValue(raw),
  };
}

const policy: Policy = {
  allowedHosts: ["localhost:8080"],
  allowedRoutePrefixes: [],
  allowedActions: ["navigate", "click", "type", "wait"],
  riskyControlPattern: "open|transfer|submit|confirm|delete",
};

const dismissNotice = {
  code: "MAINTENANCE_NOTICE",
  resultType: "recoverable" as const,
  checkpoint: { kind: "text-visible" as const, expected: "Scheduled Maintenance Notice" },
  description: "A dismissable maintenance interstitial covered the result.",
  recovery: {
    action: {
      type: "click" as const,
      control: { role: "button", accessibleName: "Dismiss notice", robustnessRationale: "Named dismiss control" },
    },
    maxAttempts: 2,
    settleMs: 0,
  },
};

describe("deterministic output extraction", () => {
  it("normalizes a currency string to the declared number type", async () => {
    const target = surface("$1,234.56");
    const result = await new ReplayEngine(target, new Actuator(target, policy)).run(capability(), {});
    expect(result).toEqual({ status: "success", outputs: { balance: 1234.56 } });
  });

  it("returns a structured block for malformed numeric output", async () => {
    const target = surface("not available");
    const result = await new ReplayEngine(target, new Actuator(target, policy)).run(capability(), {});
    expect(result).toMatchObject({
      status: "blocked", stepId: "output-balance", errorCode: "OUTPUT_EXTRACTION_FAILED",
    });
  });
});

describe("known runtime outcomes", () => {
  it("returns a structured business outcome without extracting outputs", async () => {
    const target = surface("unused");
    target.verify = vi.fn().mockImplementation(async (_kind, expected) => expected === "Account Not Found");
    const raw = { ...capability(), knownOutcomes: [{
      code: "ACCOUNT_NOT_FOUND",
      resultType: "business_outcome" as const,
      checkpoint: { kind: "text-visible" as const, expected: "Account Not Found" },
      description: "The requested synthetic account does not exist.",
    }] };
    const result = await new ReplayEngine(target, new Actuator(target, policy)).run(raw, {});
    expect(result).toEqual({
      status: "business_outcome",
      code: "ACCOUNT_NOT_FOUND",
      detail: "The requested synthetic account does not exist.",
    });
    expect(target.extract).not.toHaveBeenCalled();
  });

  it("classifies validation errors as business outcomes", async () => {
    const target = surface("unused");
    target.verify = vi.fn().mockImplementation(async (_kind, expected) => expected === "Validation Error");
    const raw = { ...capability(), knownOutcomes: [{
      code: "VALIDATION_ERROR",
      resultType: "business_outcome" as const,
      checkpoint: { kind: "text-visible" as const, expected: "Validation Error" },
      description: "The requested account input failed target validation.",
    }] };
    await expect(new ReplayEngine(target, new Actuator(target, policy)).run(raw, {})).resolves.toEqual({
      status: "business_outcome", code: "VALIDATION_ERROR",
      detail: "The requested account input failed target validation.",
    });
  });

  it("classifies an unexpected dialog as its own outcome instead of proceeding", async () => {
    const target = surface("$1,234.56");
    target.verify = vi.fn().mockImplementation(async (kind) => kind === "dialog-present");
    const raw = { ...capability(), knownOutcomes: [{
      code: "UNPOSTED_TRANSACTION_HOLD",
      resultType: "business_outcome" as const,
      checkpoint: { kind: "dialog-present" as const, expected: "Unposted transaction hold" },
      description: "The account carries an unposted transaction hold.",
    }] };
    await expect(new ReplayEngine(target, new Actuator(target, policy)).run(raw, {})).resolves.toMatchObject({
      status: "business_outcome", code: "UNPOSTED_TRANSACTION_HOLD",
    });
    expect(target.extract).not.toHaveBeenCalled();
  });

  it("classifies permission denial before the generic success failure", async () => {
    const target = surface("unused");
    target.verify = vi.fn().mockImplementation(async (_kind, expected) => expected === "Permission Denied");
    const raw = { ...capability(), knownOutcomes: [{
      code: "PERMISSION_DENIED",
      resultType: "blocked" as const,
      checkpoint: { kind: "text-visible" as const, expected: "Permission Denied" },
      description: "Customer cannot access this account",
    }] };
    const result = await new ReplayEngine(target, new Actuator(target, policy)).run(raw, {});
    expect(result).toEqual({
      status: "blocked",
      stepId: "final-checkpoint",
      stepIndex: 1,
      errorCode: "PERMISSION_DENIED",
      expected: "Customer cannot access this account",
      observed: "Matched text-visible checkpoint 'Permission Denied'",
    });
    expect(target.extract).not.toHaveBeenCalled();
  });
});

describe("recoverable conditions", () => {
  it("dismisses a known interstitial, continues, and reports the recovery", async () => {
    const target = surface("$1,234.56");
    let noticePresent = true;
    target.verify = vi.fn().mockImplementation(async (_kind, expected) => {
      if (expected === "Scheduled Maintenance Notice") return noticePresent;
      return expected === "Available:";
    });
    target.execute = vi.fn().mockImplementation(async (action: { type: string }) => {
      if (action.type === "click") noticePresent = false;
    });

    const result = await new ReplayEngine(target, new Actuator(target, policy))
      .run({ ...capability(), knownOutcomes: [dismissNotice] }, {});

    expect(result).toEqual({
      status: "success",
      outputs: { balance: 1234.56 },
      recoveries: [{ code: "MAINTENANCE_NOTICE", attempts: 1, detail: dismissNotice.description }],
    });
  });

  it("stops with a hard failure when the recovery budget is exhausted", async () => {
    const target = surface("$1,234.56");
    target.verify = vi.fn().mockImplementation(async (_kind, expected) =>
      expected === "Scheduled Maintenance Notice" || expected === "Available:");

    const result = await new ReplayEngine(target, new Actuator(target, policy))
      .run({ ...capability(), knownOutcomes: [dismissNotice] }, {});

    expect(result).toMatchObject({ status: "blocked", errorCode: "RECOVERY_EXHAUSTED" });
  });
});

describe("failure evidence", () => {
  it("captures a richer signal and returns its reference on a hard failure", async () => {
    const target = surface("not available");
    const capture = vi.fn().mockResolvedValue("evidence/failures/run-1/output-balance");
    const result = await new ReplayEngine(target, new Actuator(target, policy), {
      evidence: { capture }, runId: "run-1",
    }).run(capability(), {});

    expect(capture).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: "blocked", evidenceRef: "evidence/failures/run-1/output-balance",
    });
  });

  it("redacts sensitive input values before anything is written", async () => {
    const target = surface("not available");
    const capture = vi.fn().mockResolvedValue(undefined);
    const raw = {
      ...capability(),
      inputs: [{ name: "password", type: "string", description: "Synthetic password", required: true, sensitive: true }],
    };
    await new ReplayEngine(target, new Actuator(target, policy), { evidence: { capture } })
      .run(raw, { password: "demo1234" });

    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ redactValues: ["demo1234"] }),
      target,
    );
  });
});

describe("resume after a human handoff", () => {
  it("continues from the stopping step on the same session without re-navigating", async () => {
    let interventionRequired = true;
    const target = surface("$801.00");
    target.verify = vi.fn().mockImplementation(async (_kind, expected) => {
      if (expected === "Operator Verification Required") return interventionRequired;
      return expected === "Available:";
    });
    const raw = { ...capability(), knownOutcomes: [{
      code: "HUMAN_INTERVENTION_REQUIRED",
      resultType: "blocked" as const,
      checkpoint: { kind: "text-visible" as const, expected: "Operator Verification Required" },
      description: "Operator must verify",
    }] };
    const engine = new ReplayEngine(target, new Actuator(target, policy));

    const blocked = await engine.run(raw, {});
    expect(blocked).toMatchObject({ errorCode: "HUMAN_INTERVENTION_REQUIRED", stepIndex: 1 });

    interventionRequired = false;
    const navigations = () => (target.execute as ReturnType<typeof vi.fn>).mock.calls
      .filter(([action]) => (action as { type: string }).type === "navigate").length;
    const before = navigations();

    await expect(
      engine.resume(raw, {}, (blocked as { stepIndex: number }).stepIndex),
    ).resolves.toEqual({ status: "success", outputs: { balance: 801 } });
    expect(navigations()).toBe(before);
  });

  it("replays the remaining steps when the handoff happens mid-flow", async () => {
    const target = surface("$801.00");
    const raw = {
      ...capability(),
      steps: [
        { id: "step-01", description: "First", action: { type: "wait", milliseconds: 1 } },
        { id: "step-02", description: "Second", action: { type: "wait", milliseconds: 1 } },
        { id: "step-03", description: "Third", action: { type: "wait", milliseconds: 1 } },
      ],
    };
    const engine = new ReplayEngine(target, new Actuator(target, policy));

    await expect(engine.resume(raw, {}, 1)).resolves.toEqual({ status: "success", outputs: { balance: 801 } });
    const waits = (target.execute as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(waits).toBe(2);
  });
});
