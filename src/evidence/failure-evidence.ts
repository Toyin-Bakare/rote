import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { SurfaceAdapter } from "../core/contracts.js";

export interface FailureContext {
  runId: string;
  stepId: string;
  errorCode: string;
  /** Literal values that must never reach disk (passwords, tokens). */
  redactValues?: string[];
}

export interface FailureEvidence {
  /** Returns a repo-relative reference, or undefined if nothing could be captured. */
  capture(context: FailureContext, surface: SurfaceAdapter): Promise<string | undefined>;
}

/**
 * Writes a screenshot, a DOM snapshot, and a small metadata file for every
 * blocked result. Capture is best effort: a failing capture must never mask
 * the original failure, so errors here are swallowed and reported as "no ref".
 */
export class FileFailureEvidence implements FailureEvidence {
  constructor(private readonly root: string = resolve("evidence", "failures")) {}

  async capture(context: FailureContext, surface: SurfaceAdapter): Promise<string | undefined> {
    try {
      const snapshot = await surface.snapshot();
      const directory = join(resolve(this.root), this.safeSegment(context.runId));
      await mkdir(directory, { recursive: true });
      const base = this.safeSegment(`${context.stepId}-${context.errorCode}`);
      const html = this.redact(snapshot.domHtml, context.redactValues ?? []);

      await writeFile(join(directory, `${base}.png`), Buffer.from(snapshot.screenshotBase64, "base64"));
      await writeFile(join(directory, `${base}.html`), html, "utf8");
      await writeFile(join(directory, `${base}.json`), `${JSON.stringify({
        capturedAt: new Date().toISOString(),
        stepId: context.stepId,
        errorCode: context.errorCode,
        url: snapshot.url,
        title: snapshot.title,
        screenshot: `${base}.png`,
        domSnapshot: `${base}.html`,
      }, null, 2)}\n`, "utf8");

      return relative(process.cwd(), join(directory, base)).replaceAll("\\", "/");
    } catch {
      return undefined;
    }
  }

  private redact(html: string, values: string[]): string {
    const withoutPasswordValues = html.replace(
      /(<input[^>]*type=["']password["'][^>]*)\svalue=(["'])[\s\S]*?\2/gi,
      "$1 value=\"[REDACTED]\"",
    );
    return values
      .filter((value) => value.length > 2)
      .reduce((result, value) => result.replaceAll(value, "[REDACTED]"), withoutPasswordValues);
  }

  private safeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
  }
}
