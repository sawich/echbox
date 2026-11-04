import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { getDataDir } from "../cards/storage";

export function getProxyTempRoot(dataDir?: string): string {
  return join(getDataDir(dataDir), "tmp", "proxy");
}

export async function clearProxyTemp(dataDir?: string): Promise<void> {
  const root = getProxyTempRoot(dataDir);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
}

export async function withProxyTempDir<T>(
  fn: (dir: string) => Promise<T>,
  dataDir?: string,
): Promise<T> {
  const root = getProxyTempRoot(dataDir);
  await mkdir(root, { recursive: true });
  const dir = join(root, crypto.randomUUID());
  await mkdir(dir, { recursive: true });
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
