import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { policySchema, type Policy } from "./policy.js";

/**
 * The policy lives in a JSON file so an operator can widen or narrow the
 * guardrails without touching code. Two placeholders keep the shipped file
 * usable against any target: {{targetHost}} and {{targetPath}}.
 */
export async function loadPolicy(path: string, targetUrl: string): Promise<Policy> {
  const target = new URL(targetUrl);
  const raw = await readFile(resolve(path), "utf8");
  const resolved = raw
    .replaceAll("{{targetHost}}", target.host)
    .replaceAll("{{targetPath}}", target.pathname);
  return policySchema.parse(JSON.parse(resolved) as unknown);
}
