import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { resolveWithin } from "./safe-path";

/** Staging dir name starts with "." so it can never collide with a safe id. */
const STAGING_DIR = ".staging";

/**
 * Writes bytes to a unique temp file under `<kindRoot>/.staging/`.
 * The caller moves it to its final location (renameSync inside the DB
 * transaction) or removes it with `discardStaged`.
 */
export async function stageUpload(
  kindRoot: string,
  bytes: Uint8Array,
): Promise<string> {
  const dir = join(kindRoot, STAGING_DIR);
  await mkdir(dir, { recursive: true });
  const path = resolveWithin(kindRoot, join(dir, `${crypto.randomUUID()}.tmp`));
  await Bun.write(path, bytes);
  return path;
}

export async function discardStaged(path: string): Promise<void> {
  await rm(path, { force: true });
}

export function isUniqueConstraintError(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 4 && cur instanceof Error; depth++) {
    const code = (cur as { code?: unknown }).code;
    if (
      (typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT")) ||
      /UNIQUE constraint failed/i.test(cur.message)
    ) {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}
