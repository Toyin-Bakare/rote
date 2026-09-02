import { describe, expect, it, vi } from "vitest";
import { PlaywrightSurfaceAdapter } from "../src/surfaces/playwright-adapter.js";

function locator() {
  return {
    first: vi.fn().mockReturnThis(),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    isVisible: vi.fn().mockResolvedValue(true),
    count: vi.fn().mockResolvedValue(1),
    or: vi.fn().mockReturnThis(),
  };
}

describe("PlaywrightSurfaceAdapter", () => {
  it("prefers an exact accessible-role locator for replay", async () => {
    const target = locator();
    const page = {
      getByRole: vi.fn().mockReturnValue(target),
      locator: vi.fn().mockReturnValue(target),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = PlaywrightSurfaceAdapter.fromPage(page as never);

    await adapter.execute({
      type: "click",
      control: {
        role: "button",
        accessibleName: "Log In",
        fallbackCss: "input.button",
        robustnessRationale: "Accessible name is more stable than CSS",
      },
    });

    expect(page.getByRole).toHaveBeenCalledWith("button", { name: "Log In", exact: true });
    expect(target.click).toHaveBeenCalledOnce();
  });

  it("uses CSS only when semantic locator signals are absent", async () => {
    const target = locator();
    const page = { locator: vi.fn().mockReturnValue(target) };
    const adapter = PlaywrightSurfaceAdapter.fromPage(page as never);

    await adapter.execute({
      type: "type",
      value: "john",
      control: {
        role: "textbox",
        fallbackCss: "input[name=\"username\"]",
        robustnessRationale: "Legacy page has no usable label",
      },
    });

    expect(page.locator).toHaveBeenCalledWith("input[name=\"username\"]");
    expect(target.fill).toHaveBeenCalledWith("john");
  });

  it("scopes semantic actions to a recorded nested frame", async () => {
    const target = locator();
    const frame = {
      getByRole: vi.fn().mockReturnValue(target),
      getByLabel: vi.fn().mockReturnValue(target),
      getByText: vi.fn().mockReturnValue(target),
      locator: vi.fn().mockReturnValue(target),
    };
    const page = {
      frameLocator: vi.fn().mockReturnValue(frame),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = PlaywrightSurfaceAdapter.fromPage(page as never);

    await adapter.execute({
      type: "click",
      control: {
        role: "button",
        accessibleName: "Inspect",
        frameCss: "iframe[src=\"challengeAccount.jsp\"]",
        robustnessRationale: "Account controls live in the authenticated frame",
      },
    });

    expect(page.frameLocator).toHaveBeenCalledWith("iframe[src=\"challengeAccount.jsp\"]");
    expect(frame.getByRole).toHaveBeenCalledWith("button", { name: "Inspect", exact: true });
    expect(target.click).toHaveBeenCalledOnce();
  });

  it("cascades to CSS when a legacy visible label is not programmatically associated", async () => {
    const missing = locator();
    missing.count.mockResolvedValue(0);
    const fallback = locator();
    const page = {
      getByLabel: vi.fn().mockReturnValue(missing),
      locator: vi.fn().mockReturnValue(fallback),
    };
    const adapter = PlaywrightSurfaceAdapter.fromPage(page as never);
    await adapter.execute({
      type: "type",
      value: "john",
      control: {
        role: "textbox", label: "Username", fallbackCss: "input[name=\"username\"]",
        robustnessRationale: "Legacy text label with CSS fallback",
      },
    });
    expect(fallback.fill).toHaveBeenCalledWith("john");
  });

  it("navigates only to the action URL", async () => {
    const page = { goto: vi.fn().mockResolvedValue(undefined) };
    const adapter = PlaywrightSurfaceAdapter.fromPage(page as never);
    await adapter.execute({ type: "navigate", url: "http://localhost:8080/parabank/" });
    expect(page.goto).toHaveBeenCalledWith("http://localhost:8080/parabank/", { waitUntil: "domcontentloaded" });
  });

  it("extracts text adjacent to an unambiguous label", async () => {
    const label = {
      count: vi.fn().mockResolvedValue(1),
      first: vi.fn().mockReturnThis(),
      evaluate: vi.fn().mockResolvedValue("$10.45"),
    };
    const page = { getByText: vi.fn().mockReturnValue(label) };
    const adapter = PlaywrightSurfaceAdapter.fromPage(page as never);
    await expect(adapter.extract({ kind: "text-near-label", label: "Available:" })).resolves.toBe("$10.45");
  });

  it("captures and dismisses an unexpected dialog for outcome verification", async () => {
    let listener: ((dialog: { type(): string; message(): string; dismiss(): Promise<void> }) => void) | undefined;
    const page = { on: vi.fn().mockImplementation((_event, callback) => { listener = callback; }) };
    const adapter = PlaywrightSurfaceAdapter.fromPage(page as never);
    const dismiss = vi.fn().mockResolvedValue(undefined);
    listener?.({ type: () => "confirm", message: () => "Unexpected account notice", dismiss });
    await expect(adapter.verify("dialog-present", "Unexpected account notice")).resolves.toBe(true);
    expect(dismiss).toHaveBeenCalledOnce();
  });
});
