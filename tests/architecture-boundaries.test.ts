import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural rules that used to hold by habit. Each one is a sentence from
 * the design; here it is a build failure instead. Same shape as
 * replay-boundary.test.ts: read the source as text, refuse the pattern.
 */

const SRC = new URL("../src/", import.meta.url).pathname;

async function sourceFiles(dir = SRC): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function rel(path: string): string {
  return path.slice(SRC.length);
}

describe("architecture boundaries", () => {
  it("only the actuator calls surface.execute — no other file can bypass the safety gate", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles()) {
      if (rel(file) === "safety/actuator.ts") continue;
      const source = await readFile(file, "utf8");
      if (/surface\.execute\s*\(/.test(source)) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });

  it("only src/surfaces/ imports Playwright — the browser is behind one adapter", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles()) {
      if (rel(file).startsWith("surfaces/")) continue;
      const source = await readFile(file, "utf8");
      if (/from ["']playwright["']|import\(["']playwright["']\)/.test(source)) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });

  it("only src/discovery/ imports the OpenAI SDK — the model has one door in", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles()) {
      if (rel(file).startsWith("discovery/")) continue;
      const source = await readFile(file, "utf8");
      if (/from ["']openai["']|import\(["']openai["']\)/.test(source)) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });
});
