import { mkdirSync, renameSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isSafeStorageId, resolveWithin } from "../common/safe-path";
import { BadSoftmodError } from "./errors";

const defaultDataDir = join(import.meta.dir, "../../data");

export function getDataDir(dataDir?: string): string {
  return (
    dataDir ??
    Bun.env.DATA_DIR ??
    process.env.DATA_DIR ??
    defaultDataDir
  );
}

export function getSoftmodsRoot(dataDir?: string): string {
  return join(getDataDir(dataDir), "softmods");
}

export function assertSafeSoftmodId(softmodId: string): void {
  if (!isSafeStorageId(softmodId)) {
    throw new BadSoftmodError(
      "Softmod GUID may only contain letters, digits, dots, hyphens and underscores",
    );
  }
}

export function assertSafeVersionId(versionId: string): void {
  if (!isSafeStorageId(versionId)) {
    throw new BadSoftmodError("Invalid version id");
  }
}

/** Per-softmod directory, guaranteed to live strictly under the softmods root. */
export function getSoftmodDir(softmodId: string, dataDir?: string): string {
  assertSafeSoftmodId(softmodId);
  const root = getSoftmodsRoot(dataDir);
  return resolveWithin(root, join(root, softmodId));
}

export function softmodVersionPaths(
  dataDir: string | undefined,
  softmodId: string,
  versionId: string,
): { dir: string; originalPath: string } {
  assertSafeVersionId(versionId);
  const dir = join(getSoftmodDir(softmodId, dataDir), versionId);
  return {
    dir,
    originalPath: join(dir, "original.zipmod"),
  };
}

/** Synchronously moves a staged upload into place (safe inside a DB txn). */
export function placeStagedZipmod(
  stagedPath: string,
  destPath: string,
  dataDir?: string,
): void {
  const dest = resolveWithin(getSoftmodsRoot(dataDir), destPath);
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(stagedPath, dest);
}

export async function removeSoftmodFiles(
  softmodId: string,
  dataDir?: string,
): Promise<void> {
  const dir = getSoftmodDir(softmodId, dataDir);
  await rm(dir, { recursive: true, force: true });
}

export async function removePlacedFile(
  path: string,
  dataDir?: string,
): Promise<void> {
  await rm(resolveWithin(getSoftmodsRoot(dataDir), path), { force: true });
}
