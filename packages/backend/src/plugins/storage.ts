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

export function getPluginDir(pluginId: string, dataDir?: string): string {
  return join(getDataDir(dataDir), "plugins", pluginId);
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

export async function writeOriginalZip(
  bytes: Uint8Array,
  destPath: string,
): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });
  await Bun.write(destPath, bytes);
}

export async function removePluginFiles(
  pluginId: string,
  dataDir?: string,
): Promise<void> {
  const dir = getPluginDir(pluginId, dataDir);
  await rm(dir, { recursive: true, force: true });
}
