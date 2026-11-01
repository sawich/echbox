import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

const defaultDataDir = join(import.meta.dir, "../../data");

export function getDataDir(dataDir?: string): string {
  return (
    dataDir ??
    Bun.env.DATA_DIR ??
    process.env.DATA_DIR ??
    defaultDataDir
  );
}

export function getSoftmodDir(softmodId: string, dataDir?: string): string {
  return join(getDataDir(dataDir), "softmods", softmodId);
}

export function softmodVersionPaths(
  dataDir: string | undefined,
  softmodId: string,
  version: number,
): { dir: string; originalPath: string } {
  const dir = join(getSoftmodDir(softmodId, dataDir), `v${version}`);
  return {
    dir,
    originalPath: join(dir, "original.zipmod"),
  };
}

export async function writeOriginalZipmod(
  bytes: Uint8Array,
  destPath: string,
): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });
  await Bun.write(destPath, bytes);
}

export async function removeSoftmodFiles(
  softmodId: string,
  dataDir?: string,
): Promise<void> {
  const dir = getSoftmodDir(softmodId, dataDir);
  await rm(dir, { recursive: true, force: true });
}
