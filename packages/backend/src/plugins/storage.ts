import { mkdirSync, renameSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isSafeStorageId, resolveWithin } from "../common/safe-path";
import { BadPluginError } from "./errors";

const defaultDataDir = join(import.meta.dir, "../../data");

export function getDataDir(dataDir?: string): string {
  return (
    dataDir ??
    Bun.env.DATA_DIR ??
    process.env.DATA_DIR ??
    defaultDataDir
  );
}

export function getPluginsRoot(dataDir?: string): string {
  return join(getDataDir(dataDir), "plugins");
}

export function assertSafePluginId(pluginId: string): void {
  if (!isSafeStorageId(pluginId)) {
    throw new BadPluginError("Invalid plugin id");
  }
}

/** Per-plugin directory, guaranteed to live strictly under the plugins root. */
export function getPluginDir(pluginId: string, dataDir?: string): string {
  assertSafePluginId(pluginId);
  const root = getPluginsRoot(dataDir);
  return resolveWithin(root, join(root, pluginId));
}

export function pluginVersionPaths(
  dataDir: string | undefined,
  pluginId: string,
  version: number,
): { dir: string; originalPath: string } {
  const dir = join(getPluginDir(pluginId, dataDir), `v${version}`);
  return {
    dir,
    originalPath: join(dir, "original.zip"),
  };
}

/** Synchronously moves a staged upload into place (safe inside a DB txn). */
export function placeStagedZip(
  stagedPath: string,
  destPath: string,
  dataDir?: string,
): void {
  const dest = resolveWithin(getPluginsRoot(dataDir), destPath);
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(stagedPath, dest);
}

export async function removePluginFiles(
  pluginId: string,
  dataDir?: string,
): Promise<void> {
  const dir = getPluginDir(pluginId, dataDir);
  await rm(dir, { recursive: true, force: true });
}

export async function removePlacedFile(
  path: string,
  dataDir?: string,
): Promise<void> {
  await rm(resolveWithin(getPluginsRoot(dataDir), path), { force: true });
}
