import { existsSync } from "node:fs";
import { join } from "node:path";

export const FIXTURES = join(import.meta.dir, "../../../fixtures");

export function fixture(...parts: string[]): string {
  const path = join(FIXTURES, ...parts);
  if (!existsSync(path)) {
    throw new Error(
      `Missing fixture: ${path}\nSee packages/backend/fixtures/README.md`,
    );
  }
  return path;
}

export async function fixtureBytes(...parts: string[]): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(fixture(...parts)).arrayBuffer());
}
