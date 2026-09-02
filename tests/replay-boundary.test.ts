import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("replay architecture boundary", () => {
  it("does not import the OpenAI SDK or discovery package", async () => {
    const source = await readFile(new URL("../src/replay/replay-engine.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from ["']openai/);
    expect(source).not.toMatch(/discovery/);
  });
});
