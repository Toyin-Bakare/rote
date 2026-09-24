import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The secret scan as a test, not a one-off JSON file. Nothing that ships in
 * evidence/ or capabilities/ may contain a real key, a private key block,
 * or the demo password in clear.
 */

const ROOT = fileURLToPath(new URL("../", import.meta.url));

async function textFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await textFiles(full)));
    else if (/\.(json|html|md|txt)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const PATTERNS: Array<[string, RegExp]> = [
  ["OpenAI API key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["demo password in clear", /demo1234/],
];

describe("no secrets in shipped artifacts", () => {
  for (const folder of ["evidence", "capabilities"]) {
    it(`${folder}/ contains no key, private key, or clear-text demo password`, async () => {
      const hits: string[] = [];
      for (const file of await textFiles(join(ROOT, folder))) {
        const text = await readFile(file, "utf8");
        for (const [label, re] of PATTERNS) {
          if (re.test(text)) hits.push(`${relative(ROOT, file).split("\\").join("/")}: ${label}`);
        }
      }
      expect(hits).toEqual([]);
    });
  }
});
