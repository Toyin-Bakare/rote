import { resolve } from "node:path";
import type { Browser, Frame, FrameLocator, Locator, Page } from "playwright";
import type { SurfaceAdapter, SurfaceObservation, SurfaceSnapshot } from "../core/contracts.js";
import type { Action, ControlDescriptor, OutputExtraction } from "../core/types.js";

export interface PlaywrightSurfaceOptions {
  headless?: boolean;
  navigationTimeoutMs?: number;
  actionTimeoutMs?: number;
}

export class PlaywrightSurfaceAdapter implements SurfaceAdapter {
  private pendingDialog?: { type: string; message: string };
  private ocrWorker?: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;

  private constructor(
    private readonly page: Page,
    private readonly ownedBrowser?: Browser,
  ) {
    if (typeof (this.page as Partial<Page>).on === "function") {
      this.page.on("dialog", (dialog) => {
        this.pendingDialog = { type: dialog.type(), message: dialog.message() };
        void dialog.dismiss();
      });
    }
  }

  static fromPage(page: Page): PlaywrightSurfaceAdapter {
    return new PlaywrightSurfaceAdapter(page);
  }

  static async launch(options: PlaywrightSurfaceOptions = {}): Promise<PlaywrightSurfaceAdapter> {
    process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".playwright-browsers");
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: options.headless ?? true,
      chromiumSandbox: false,
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(options.navigationTimeoutMs ?? 15_000);
    page.setDefaultTimeout(options.actionTimeoutMs ?? 5_000);
    return new PlaywrightSurfaceAdapter(page, browser);
  }

  async close(): Promise<void> {
    await this.ocrWorker?.terminate();
    await this.ownedBrowser?.close();
  }

  async observe(): Promise<SurfaceObservation> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.page.waitForLoadState("domcontentloaded");
      try {
        const childFrames = this.page.frames().filter((frame) => frame !== this.page.mainFrame());
        const [title, mainVisibleText, mainControls, screenshot, frameObservations] = await Promise.all([
      this.page.title(),
      this.page.locator("body").innerText(),
      this.observeControls(this.page),
      this.page.screenshot({ type: "jpeg", quality: 65 }),
      Promise.all(childFrames.map(async (frame) => ({
        url: frame.url(),
        text: await frame.locator("body").innerText().catch(() => ""),
        controls: await this.observeControls(frame, await this.frameSelector(frame)),
      }))),
        ]);

        const visibleText = [mainVisibleText, ...frameObservations.map(({ url, text }) =>
          text ? `[Nested frame ${url}]\n${text}` : "",
        )].filter(Boolean).join("\n");
        const controls = [...mainControls, ...frameObservations.flatMap((entry) => entry.controls)];

        return {
          url: this.page.url(), title, visibleText, controls,
          screenshotBase64: screenshot.toString("base64"),
          ...(this.pendingDialog ? { dialog: this.pendingDialog } : {}),
        };
      } catch (error) {
        const navigationRace = error instanceof Error && error.message.includes("Execution context was destroyed");
        if (!navigationRace || attempt === 2) throw error;
        await this.page.waitForTimeout(100);
      }
    }
    throw new Error("Could not observe a stable document");
  }

  /**
   * Richer capture used for failure evidence. Full-page screenshot plus the
   * serialized DOM of the main document and every live child frame, so a
   * legacy frameset is debuggable and not just a picture.
   */
  async snapshot(): Promise<SurfaceSnapshot> {
    const [title, mainHtml, frameHtml, screenshot] = await Promise.all([
      this.page.title().catch(() => ""),
      this.page.content().catch(() => ""),
      Promise.all(this.page.frames().slice(1).map(async (frame) => {
        const html = await frame.content().catch(() => "");
        return html ? `\n<!-- nested frame: ${frame.url()} -->\n${html}` : "";
      })),
      this.page.screenshot({ fullPage: true, type: "png" }),
    ]);
    return {
      url: this.page.url(),
      title,
      screenshotBase64: screenshot.toString("base64"),
      domHtml: [mainHtml, ...frameHtml].filter(Boolean).join("\n"),
    };
  }

  private async observeControls(root: Page | Frame, frameCss?: string): Promise<ControlDescriptor[]> {
    return root.locator("a,button,input,select,textarea,[role]").evaluateAll((elements, frameSelector) =>
        elements
          .filter((element) => {
            const html = element as HTMLElement;
            const style = window.getComputedStyle(html);
            return style.visibility !== "hidden" && style.display !== "none" && html.getClientRects().length > 0;
          })
          .slice(0, 200)
          .map((element) => {
            const html = element as HTMLElement;
            const input = element as HTMLInputElement;
            const tag = element.tagName.toLowerCase();
            const role = element.getAttribute("role") ??
              (tag === "a" ? "link" : tag === "button" ? "button" :
                tag === "select" ? "combobox" : tag === "textarea" ? "textbox" :
                  tag === "input" && ["submit", "button", "reset"].includes(input.type) ? "button" : "textbox");
            const buttonLike = tag === "button" || (tag === "input" && ["submit", "button", "reset"].includes(input.type));
            const accessibleName = element.getAttribute("aria-label") ?? input.alt ?? (buttonLike ? input.value : undefined) ?? undefined;
            const label = input.labels?.[0]?.innerText.trim() || undefined;
            const text = html.innerText.trim() || undefined;
            const valueState: "empty" | "set" | undefined = ["input", "select", "textarea"].includes(tag)
              ? (input.value ? "set" : "empty")
              : undefined;
            const dynamicId = element.id.match(/^(.+_)[a-f0-9]{10}$/i);
            const id = element.id
              ? (dynamicId ? `[id^="${CSS.escape(dynamicId[1] ?? "")}"]` : `#${CSS.escape(element.id)}`)
              : undefined;
            const name = element.getAttribute("name");
            const fallbackCss = id ?? (name ? `${tag}[name="${CSS.escape(name)}"]` : undefined);
            return {
              role,
              ...(accessibleName ? { accessibleName } : {}),
              ...(label ? { label } : {}),
              ...(text ? { text } : {}),
              ...(valueState ? { valueState } : {}),
              ...(frameSelector ? { frameCss: frameSelector } : {}),
              ...(fallbackCss ? { fallbackCss } : {}),
              robustnessRationale: accessibleName || label || text
                ? "Semantic locator available"
                : "No semantic signal; controlled CSS fallback required",
            };
          })
          .filter((control) => control.accessibleName || control.label || control.text || control.fallbackCss),
      frameCss,
    ) as Promise<ControlDescriptor[]>;
  }

  private async frameSelector(frame: Frame): Promise<string> {
    const owner = await frame.frameElement();
    const src = await owner.getAttribute("src");
    if (src) return `iframe[src=${JSON.stringify(src)}]`;
    const name = await owner.getAttribute("name");
    if (name) {
      const dynamicName = name.match(/^(.+_)[a-f0-9]{10}$/i);
      return dynamicName ? `iframe[name^=${JSON.stringify(dynamicName[1])}]` : `iframe[name=${JSON.stringify(name)}]`;
    }
    return "iframe";
  }

  async execute(action: Action): Promise<void> {
    switch (action.type) {
      case "navigate":
        await this.page.goto(action.url, { waitUntil: "domcontentloaded" });
        return;
      case "click":
        // Let Playwright synchronize form submissions and link navigations.
        // Advancing immediately after `noWaitAfter` made deterministic replay
        // race legacy server-rendered pages even though discovery appeared sound.
        await (await this.locate(action.control)).click();
        await this.page.waitForLoadState("domcontentloaded");
        // A child-frame form can finish after the top-level document is already
        // idle; allow its replacement document to become observable.
        await this.page.waitForTimeout(350);
        return;
      case "type":
        await (await this.locate(action.control)).fill(action.value);
        return;
      case "wait":
        await this.page.waitForTimeout(action.milliseconds);
    }
  }

  async verify(kind: "text-visible" | "visual-text-visible" | "url-matches" | "control-visible" | "dialog-present", expected: string): Promise<boolean> {
    if (kind === "url-matches") return this.page.url().includes(expected);
    if (kind === "dialog-present") return Boolean(this.pendingDialog?.message.includes(expected));
    if (kind === "visual-text-visible") return (await this.ocrText()).toLowerCase().includes(expected.toLowerCase());
    if (kind === "text-visible") {
      if (await this.page.getByText(expected, { exact: false }).first().isVisible()) return true;
      for (const frame of this.page.frames().slice(1)) {
        try {
          if (await frame.getByText(expected, { exact: false }).first().isVisible()) return true;
        } catch {
          // A legacy child frame can detach while its form navigates.
        }
      }
      return false;
    }
    const mainControl = this.page.getByRole("button", { name: expected, exact: false }).or(
      this.page.getByRole("link", { name: expected, exact: false }),
    ).or(this.page.getByLabel(expected, { exact: false })).first();
    if (await mainControl.isVisible()) return true;
    for (const frame of this.page.frames().slice(1)) {
      try {
        const control = frame.getByRole("button", { name: expected, exact: false }).or(
          frame.getByRole("link", { name: expected, exact: false }),
        ).or(frame.getByLabel(expected, { exact: false })).first();
        if (await control.isVisible()) return true;
      } catch {
        // Ignore detached child frames and continue checking the live set.
      }
    }
    return false;
  }

  async extract(source: OutputExtraction): Promise<string> {
    if (source.kind === "visual-text-near-label") {
      const text = await this.ocrText(source.frameCss, source.visualCss);
      const label = source.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = text.match(new RegExp(`${label}[\\s\\S]{0,120}?(\\(?[-+]?\\$?\\s*(?=[\\d,]*\\d)[\\d,]+(?:\\.\\d{1,2})?\\)?)`, "i"));
      if (match?.[1]) return match[1];
      const currencyCandidates = [...text.matchAll(/\(?[-+]?\$?\s*\d[\d,]*\.\d{2}\)?/g)]
        .map((candidate) => candidate[0].trim());
      const uniqueCandidates = [...new Set(currencyCandidates)];
      if (uniqueCandidates.length === 1) return uniqueCandidates[0] ?? "";
      throw new Error(
        `OCR found no unambiguous value near visual label '${source.label}'. ` +
        `Candidates: ${JSON.stringify(uniqueCandidates)}. Observed: ${text.slice(0, 1200)}`,
      );
    }
    const labels = this.page.getByText(source.label, { exact: true });
    const count = await labels.count();
    if (count === 0) throw new Error(`Extraction label '${source.label}' was not found`);
    if (count > 1) throw new Error(`Extraction label '${source.label}' is ambiguous (${count} matches)`);
    const value = await labels.first().evaluate((element) => {
      const container = element.closest("td,th,dt,label") ?? element;
      const sibling = container.nextElementSibling?.textContent?.trim();
      if (sibling) return sibling;
      const row = container.closest("tr");
      if (row) {
        const cells = Array.from(row.querySelectorAll(":scope > th, :scope > td"));
        const index = cells.indexOf(container);
        const nextCell = index >= 0 ? cells[index + 1]?.textContent?.trim() : undefined;
        if (nextCell) return nextCell;
      }
      return "";
    });
    if (!value) throw new Error(`No value was found near extraction label '${source.label}'`);
    return value;
  }

  private async locate(control: ControlDescriptor): Promise<Locator> {
    const root: Page | FrameLocator = control.frameCss ? this.page.frameLocator(control.frameCss) : this.page;
    const candidates: Locator[] = [];
    let ambiguousCount = 0;
    if (control.accessibleName) {
      candidates.push(root.getByRole(control.role as Parameters<Page["getByRole"]>[0], {
        name: control.accessibleName,
        exact: true,
      }));
    }
    if (control.label) candidates.push(root.getByLabel(control.label, { exact: true }));
    if (control.text) candidates.push(root.getByText(control.text, { exact: true }));
    // Some legacy surfaces expose duplicate "Login" labels; prefer the link
    // that actually routes to authentication when available.
    if (control.role === "link" && /login/i.test(control.accessibleName ?? control.text ?? "")) {
      candidates.unshift(root.locator('a[href$="/login"]'));
    }
    if (control.role === "button" && /login|sign\s*in|submit/i.test(control.accessibleName ?? control.text ?? "")) {
      candidates.unshift(root.locator('form input[type="submit"], form button[type="submit"]'));
    }
    if (control.fallbackCss) candidates.push(root.locator(control.fallbackCss));
    for (const candidate of candidates) {
      const count = await candidate.count();
      if (count === 1) return candidate.first();
      // A broad semantic match may be ambiguous; continue to a more specific
      // label/text/CSS fallback before failing closed.
      if (count > 1) { ambiguousCount = Math.max(ambiguousCount, count); continue; }
    }
    if (ambiguousCount > 1) throw new Error(`Ambiguous control locator matched ${ambiguousCount} elements`);
    throw new Error("No locator signal resolved to a control");
  }

  private async ocrText(frameCss?: string, visualCss?: string): Promise<string> {
    if (!this.ocrWorker) {
      const { createWorker } = await import("tesseract.js");
      this.ocrWorker = await createWorker("eng", 1, {
        langPath: resolve("ocr-data"),
        cachePath: resolve(".tmp", "tesseract-cache"),
      });
    }
    const screenshot = frameCss
      ? await this.page.frameLocator(frameCss).locator(visualCss ?? "canvas").screenshot()
      : await this.page.screenshot({ fullPage: true });
    const result = await this.ocrWorker.recognize(screenshot);
    return result.data.text;
  }
}
