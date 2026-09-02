export type SessionActor = "automation" | "human";
export type SessionEvent = "run-started" | "paused" | "control-transferred" | "action" | "resumed" | "run-completed";

export interface TimelineEntry {
  at: string;
  actor: SessionActor;
  event: SessionEvent;
  detail: string;
}

export class SessionLease {
  private owner: SessionActor = "automation";
  private paused = false;
  private readonly entries: TimelineEntry[] = [];

  constructor() {
    this.record("automation", "run-started", "Automation acquired the live session lease");
  }

  assertAutomationControl(): void {
    if (this.owner !== "automation" || this.paused) {
      throw new Error(`Automation does not hold an active session lease (owner=${this.owner}, paused=${this.paused})`);
    }
  }

  pause(reason: string): void {
    this.assertAutomationControl();
    this.paused = true;
    this.record("automation", "paused", reason);
  }

  transferToHuman(reason: string): void {
    if (!this.paused || this.owner !== "automation") throw new Error("Automation must pause before human takeover");
    this.owner = "human";
    this.record("human", "control-transferred", reason);
  }

  recordHumanAction(detail: string): void {
    if (this.owner !== "human") throw new Error("Human does not hold the session lease");
    this.record("human", "action", detail);
  }

  returnToAutomation(reason: string): void {
    if (this.owner !== "human") throw new Error("Human does not hold the session lease");
    this.owner = "automation";
    this.record("automation", "control-transferred", reason);
  }

  resume(): void {
    if (this.owner !== "automation" || !this.paused) throw new Error("Automation cannot resume this session");
    this.paused = false;
    this.record("automation", "resumed", "Automation resumed the paused replay");
  }

  complete(detail: string): void {
    this.assertAutomationControl();
    this.record("automation", "run-completed", detail);
  }

  snapshot(): { owner: SessionActor; paused: boolean; timeline: TimelineEntry[] } {
    return { owner: this.owner, paused: this.paused, timeline: [...this.entries] };
  }

  private record(actor: SessionActor, event: SessionEvent, detail: string): void {
    this.entries.push({ at: new Date().toISOString(), actor, event, detail });
  }
}
