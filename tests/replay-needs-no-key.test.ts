import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A reviewer with no .env must be able to run every replay. The OpenAI key
 * is optional in config, and the replay engine can be built without it.
 */
describe("replay needs no model key", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("config loads with OPENAI_API_KEY unset", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
    const { config } = await import("../src/config.js");
    expect(config.OPENAI_API_KEY).toBeUndefined();
    expect(config.ROTE_TARGET_URL).toMatch(/^http/);
  });

  it("a ReplayEngine can be constructed with no key in the environment", async () => {
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
    const { ReplayEngine } = await import("../src/replay/replay-engine.js");
    const { Actuator } = await import("../src/safety/actuator.js");
    const surface = {
      observe: vi.fn(), snapshot: vi.fn(), execute: vi.fn(), verify: vi.fn(), extract: vi.fn(),
    };
    const policy = { allowedHosts: ["localhost"], allowedRoutePrefixes: ["/"], allowedActions: ["wait"], riskyControlPattern: "transfer" };
    const actuator = new Actuator(surface as never, policy as never);
    expect(() => new ReplayEngine(surface as never, actuator)).not.toThrow();
  });
});
