import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { capabilitySchema, type Capability } from "../core/types.js";

export class CapabilityRepository {
  constructor(private readonly root: string) {}

  async save(rawCapability: unknown): Promise<string> {
    const capability = capabilitySchema.parse(rawCapability);
    const directory = this.safePath(capability.name);
    const destination = join(directory, `v${capability.version}.json`);
    const temporary = `${destination}.tmp`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, `${JSON.stringify(capability, null, 2)}\n`, "utf8");
    await rename(temporary, destination);
    return destination;
  }

  async load(name: string, version: number): Promise<Capability> {
    if (!Number.isInteger(version) || version < 1) throw new Error("Capability version must be a positive integer");
    const source = join(this.safePath(name), `v${version}.json`);
    return capabilitySchema.parse(JSON.parse(await readFile(source, "utf8")) as unknown);
  }

  private safePath(name: string): string {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid capability name");
    const root = resolve(this.root);
    const candidate = resolve(root, name);
    if (!candidate.startsWith(`${root}${sep}`)) throw new Error("Capability path escapes repository root");
    return candidate;
  }
}
