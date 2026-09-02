import { z } from "zod";
import type { Action } from "../core/types.js";

export const policySchema = z.object({
  allowedHosts: z.array(z.string().min(1)).min(1),
  /** Optional path narrowing. Empty means "any route on an allowed host". */
  allowedRoutePrefixes: z.array(z.string().min(1)).default([]),
  allowedActions: z.array(z.enum(["navigate", "click", "type", "wait"])).min(1),
  riskyControlPattern: z.string().default("open|transfer|submit|confirm|delete"),
});

export type Policy = z.infer<typeof policySchema>;

export type PolicyDecision =
  | { allowed: true; risk: "safe" | "reversible" }
  | { allowed: false; risk: "risky"; reason: string };

export function evaluateAction(policy: Policy, action: Action): PolicyDecision {
  if (!policy.allowedActions.includes(action.type)) {
    return { allowed: false, risk: "risky", reason: `Action type '${action.type}' is not allowed` };
  }

  if (action.type === "navigate") {
    const url = new URL(action.url);
    if (!policy.allowedHosts.includes(url.host)) {
      return { allowed: false, risk: "risky", reason: `Host '${url.host}' is not allowed` };
    }
    if (policy.allowedRoutePrefixes.length > 0 &&
        !policy.allowedRoutePrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
      return { allowed: false, risk: "risky", reason: `Route '${url.pathname}' is not allowed` };
    }
    return { allowed: true, risk: "reversible" };
  }

  if (action.type === "click") {
    const target = [action.control.accessibleName, action.control.label, action.control.text]
      .filter(Boolean)
      .join(" ");
    if (new RegExp(policy.riskyControlPattern, "i").test(target)) {
      return { allowed: false, risk: "risky", reason: "Risky action requires human confirmation" };
    }
  }

  return { allowed: true, risk: action.type === "type" ? "reversible" : "safe" };
}
