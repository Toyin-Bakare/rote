import { describe, expect, it, vi } from "vitest";
import { DiscoveryRunner } from "../src/discovery/discovery-runner.js";

const observation = { url: "http://localhost:8083/", title: "AltoroJ", visibleText: "stuck", controls: [] };
const actuator = { execute: vi.fn(async () => undefined) } as never;

describe("discovery stopping conditions", () => {
  it("stops on a configured timeout", async () => {
    const surface = { observe: vi.fn(async () => observation) } as never;
    // A deliberate per-turn delay makes the wall-clock stop deterministic:
    // without it, several sub-millisecond turns can pass before the deadline
    // and the dead-end fingerprint fires first.
    const model = { decide: vi.fn(async () => {
      await new Promise((resolveTurn) => setTimeout(resolveTurn, 5));
      return { action: { type: "wait", milliseconds: 1 }, goalComplete: false, sanitizedReason: "wait" };
    }) } as never;
    await expect(new DiscoveryRunner(surface, actuator, model).run("goal", 12, undefined, 1)).rejects.toThrow("timeoutMs=1");
  });

  it("stops when the same observation and action repeat", async () => {
    const surface = { observe: vi.fn(async () => observation) } as never;
    const model = { decide: vi.fn(async () => ({ action: { type: "wait", milliseconds: 1 }, goalComplete: false, sanitizedReason: "wait" })) } as never;
    await expect(new DiscoveryRunner(surface, actuator, model).run("goal", 12)).rejects.toThrow("dead-end detected");
  });
});
