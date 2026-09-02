import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CapabilityRecorder } from "./capability/recorder.js";
import { CapabilityRepository } from "./capability/repository.js";
import { config } from "./config.js";
import { DiscoveryRunner } from "./discovery/discovery-runner.js";
import { OpenAIDiscoveryModel } from "./discovery/openai-model.js";
import { FileFailureEvidence } from "./evidence/failure-evidence.js";
import { ReplayEngine } from "./replay/replay-engine.js";
import { Actuator } from "./safety/actuator.js";
import { loadPolicy } from "./safety/policy-file.js";
import { HandoffCoordinator, type HandoffRequest } from "./session/handoff-coordinator.js";
import { SessionLease } from "./session/session-lease.js";
import { PlaywrightSurfaceAdapter } from "./surfaces/playwright-adapter.js";

const command = process.argv[2];
const args = process.argv.slice(3);

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseInputs(): Record<string, unknown> {
  return args.flatMap((value, index) => value === "--input" ? [args[index + 1]] : [])
    .filter((value): value is string => Boolean(value))
    .reduce<Record<string, unknown>>((result, pair) => {
      const separator = pair.indexOf("=");
      if (separator < 1) throw new Error(`Invalid --input '${pair}'; expected name=value`);
      result[pair.slice(0, separator)] = pair.slice(separator + 1);
      return result;
    }, {});
}

function isSensitiveName(name: string): boolean {
  return /password|secret|token|key/i.test(name);
}

function sanitizedInputs(inputs: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(inputs).map(([name, value]) => [
    name, isSensitiveName(name) ? "[REDACTED]" : value,
  ]));
}

function redactSecrets(text: string, inputs: Record<string, unknown>): string {
  return Object.entries(inputs).reduce((safe, [name, value]) =>
    isSensitiveName(name) ? safe.replaceAll(String(value), "[REDACTED]") : safe, text);
}

function evidencePath(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
    throw new Error("--evidence must contain only letters, digits, and hyphens");
  }
  return resolve("evidence", `${name}.json`);
}

function scalarContracts(
  values: Record<string, unknown>,
  output: boolean,
  extractionLabel?: string,
  extractionKind: "text-near-label" | "visual-text-near-label" = "text-near-label",
) {
  return Object.entries(values).flatMap(([name, value]) => {
    const inferredNumericOutput = output && typeof value === "string" &&
      /^\(?[-+]?\$?\s*[\d,]+(?:\.\d+)?\)?$/.test(value.trim());
    const type = inferredNumericOutput ? "number" : typeof value;
    if (type !== "string" && type !== "number" && type !== "boolean") return [];
    return [{
      name,
      type,
      description: output ? `Value extracted for ${name}` : `Synthetic discovery input for ${name}`,
      required: true,
      sensitive: isSensitiveName(name),
      ...(output && extractionLabel ? { extraction: { kind: extractionKind, label: extractionLabel } } : {}),
    }];
  });
}

// The target is an explicit argument. --target wins, then ROTE_TARGET_URL.
const targetUrl = option("--target") ?? config.ROTE_TARGET_URL;
const target = new URL(targetUrl);
// Guardrails come from a JSON file, so they can be changed without a rebuild.
const resolvePolicy = () => loadPolicy(config.ROTE_POLICY_PATH, targetUrl);
const failureEvidence = new FileFailureEvidence(resolve("evidence", "failures"));

if (command === "discover") {
  if (!config.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for discovery");
  const goal = option("--goal");
  if (!goal) throw new Error("--goal is required for discovery");
  const runId = `discovery-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const policy = await resolvePolicy();
  const surface = await PlaywrightSurfaceAdapter.launch({ headless: config.ROTE_HEADLESS === "true" });
  try {
    const actuator = new Actuator(surface, policy);
    const runner = new DiscoveryRunner(surface, actuator, new OpenAIDiscoveryModel(config.OPENAI_API_KEY, config.OPENAI_MODEL));
    await actuator.execute({ type: "navigate", url: targetUrl });
    const maxSteps = Number(option("--max-steps") ?? 12);
    const timeoutMs = Number(option("--timeout-ms") ?? 120_000);
    if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error("--max-steps must be a positive integer");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("--timeout-ms must be a positive integer");
    const inputExamples = parseInputs();

    let discovery;
    try {
      discovery = await runner.run(goal, maxSteps, (step) => {
        console.error(JSON.stringify({
          step: step.index + 1,
          action: step.action?.type ?? null,
          reason: step.sanitizedReason,
          goalComplete: step.goalComplete,
        }));
      }, timeoutMs);
    } catch (error) {
      // A stopped discovery run is still a run worth debugging.
      const reason = error instanceof Error ? error.message : String(error);
      const ref = await failureEvidence.capture({
        runId,
        stepId: "discovery",
        errorCode: "DISCOVERY_STOPPED",
        redactValues: Object.entries(inputExamples)
          .filter(([name]) => isSensitiveName(name))
          .map(([, value]) => String(value)),
      }, surface);
      const evidenceName = option("--evidence");
      if (evidenceName) {
        await writeFile(evidencePath(evidenceName), `${JSON.stringify({
          runType: "openai-guided-discovery",
          model: config.OPENAI_MODEL,
          target: targetUrl,
          syntheticDataOnly: true,
          result: "stopped",
          goal: redactSecrets(goal, inputExamples),
          stopReason: redactSecrets(reason, inputExamples),
          ...(ref ? { evidenceRef: ref } : {}),
        }, null, 2)}\n`, "utf8");
      }
      throw error;
    }

    console.log(JSON.stringify(discovery, null, 2));
    const recordName = option("--record");
    let recordedCapability: string | undefined;
    if (recordName) {
      const successText = option("--success-text");
      if (!successText) throw new Error("--success-text is required when --record is used");
      const extractedOutputs = discovery.at(-1)?.extractedOutputs ?? {};
      const extractionLabel = option("--output-label");
      const extractionKind = option("--output-kind") === "visual-text-near-label"
        ? "visual-text-near-label" as const
        : "text-near-label" as const;
      const successKind = option("--success-kind") === "visual-text-visible"
        ? "visual-text-visible" as const
        : "text-visible" as const;
      const capability = new CapabilityRecorder().record({
        name: recordName,
        description: goal,
        target: { application: option("--application") ?? target.hostname, entryUrl: targetUrl },
        inputs: scalarContracts(inputExamples, false),
        inputExamples: inputExamples as Record<string, string | number | boolean>,
        outputs: scalarContracts(extractedOutputs, true, extractionLabel, extractionKind),
        success: { kind: successKind, expected: successText },
      }, discovery);
      recordedCapability = await new CapabilityRepository(resolve("capabilities")).save(capability);
      console.log(`Recorded capability: ${recordedCapability}`);
    }
    const evidenceName = option("--evidence");
    if (evidenceName) {
      await writeFile(evidencePath(evidenceName), `${JSON.stringify({
        runType: "openai-guided-discovery",
        model: config.OPENAI_MODEL,
        target: targetUrl,
        syntheticDataOnly: true,
        result: "success",
        goal: redactSecrets(goal, inputExamples),
        ...(recordedCapability ? { recordedCapability } : {}),
        steps: discovery.map((step) => ({
          index: step.index + 1,
          action: step.action?.type ?? null,
          reason: step.sanitizedReason,
          goalComplete: step.goalComplete,
          ...(step.extractedOutputs ? { extractedOutputs: step.extractedOutputs } : {}),
        })),
      }, null, 2)}\n`, "utf8");
    }
  } finally {
    await surface.close();
  }
} else if (command === "replay") {
  const capabilityPath = option("--capability");
  if (!capabilityPath) throw new Error("--capability is required for replay");
  const capability = JSON.parse(await readFile(capabilityPath, "utf8")) as {
    name?: string; description?: string; steps?: Array<{ id?: string }>;
  };
  const policy = await resolvePolicy();
  const runId = `replay-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await mkdir(resolve("evidence", "failures"), { recursive: true });
  const surface = await PlaywrightSurfaceAdapter.launch({ headless: config.ROTE_HEADLESS === "true" });
  try {
    const replayInputs = parseInputs();
    const lease = new SessionLease();
    const engine = new ReplayEngine(surface, new Actuator(surface, policy, lease), {
      evidence: failureEvidence,
      runId,
    });
    let result = await engine.run(capability, replayInputs);
    let interventionRequest: Record<string, unknown> | undefined;

    if (result.status === "blocked" && result.errorCode === "HUMAN_INTERVENTION_REQUIRED" && args.includes("--handoff")) {
      if (config.ROTE_HEADLESS === "true") throw new Error("--handoff requires ROTE_HEADLESS=false");
      const request: HandoffRequest = {
        capability: capabilityPath,
        goal: redactSecrets(capability.description ?? capability.name ?? capabilityPath, replayInputs),
        code: result.errorCode,
        reason: result.expected,
        stepId: result.stepId,
        stepIndex: result.stepIndex,
        observed: result.observed,
        resolutionCheckpoint: "Operator Verification Required",
        evidenceRef: result.evidenceRef,
      };
      interventionRequest = HandoffCoordinator.describe(request);
      console.error(JSON.stringify({ interventionRequest }, null, 2));

      const resumeFromStepIndex = result.stepIndex;
      const carriedRecoveries = result.recoveries ?? [];
      await new HandoffCoordinator(lease).run(request, async () => {
        console.error("Control transferred to you. Click 'Operator resolved - resume automation' in Chromium; automation will detect the change automatically.");
        const deadline = Date.now() + 120_000;
        while (await surface.verify("text-visible", request.resolutionCheckpoint)) {
          if (Date.now() >= deadline) throw new Error("Timed out waiting for operator verification");
          await new Promise((resolveWait) => setTimeout(resolveWait, 500));
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      }, async () => !await surface.verify("text-visible", request.resolutionCheckpoint));

      // Same session, no re-navigation: continue from the step that stopped.
      result = await engine.resume(capability, replayInputs, resumeFromStepIndex, carriedRecoveries);
      lease.complete(`Resumed replay finished with status=${result.status}`);
    }

    const evidenceName = option("--evidence");
    if (evidenceName) {
      await writeFile(evidencePath(evidenceName), `${JSON.stringify({
        runType: "deterministic-replay",
        runId,
        target: targetUrl,
        capability: capabilityPath,
        inputs: sanitizedInputs(replayInputs),
        stepSequence: (capability.steps ?? []).map((step, index) => step.id ?? `step-${index + 1}`),
        result,
        ...(interventionRequest ? { interventionRequest } : {}),
        session: lease.snapshot(),
      }, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "blocked") process.exitCode = 1;
  } finally {
    await surface.close();
  }
} else {
  console.log([
    "Usage:",
    "  npm run discover -- --goal \"...\" [--target URL] [--max-steps N] [--timeout-ms N]",
    "                     [--record name --application name --success-text \"text\" --success-kind visual-text-visible]",
    "                     [--output-label \"label\" --output-kind visual-text-near-label]",
    "                     [--input name=value ...] [--evidence name]",
    "  npm run replay   -- --capability <path> [--target URL] [--input name=value ...] [--handoff] [--evidence name]",
  ].join("\n"));
}
