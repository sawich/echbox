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

export function getCardDir(cardId: string, dataDir?: string): string {
  return join(getDataDir(dataDir), "cards", cardId);
}

export function getVersionDir(
  cardId: string,
  versionId: string,
  dataDir?: string,
): string {
  return join(getCardDir(cardId, dataDir), versionId);
}

export type VersionPaths = {
  versionDir: string;
  originalPath: string;
  previewPath: string;
};

export function getVersionPaths(
  cardId: string,
  versionId: string,
  dataDir?: string,
): VersionPaths {
  const versionDir = getVersionDir(cardId, versionId, dataDir);
  return {
    versionDir,
    originalPath: join(versionDir, "original.png"),
    previewPath: join(versionDir, "preview.webp"),
  };
}

export async function writeOriginalPng(
  bytes: Uint8Array,
  destPath: string,
): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });
  await Bun.write(destPath, bytes);
}

export async function removeCardFiles(
  cardId: string,
  dataDir?: string,
): Promise<void> {
  const dir = getCardDir(cardId, dataDir);
  await rm(dir, { recursive: true, force: true });
}

export async function removeVersionFiles(
  cardId: string,
  versionId: string,
  dataDir?: string,
): Promise<void> {
  const dir = getVersionDir(cardId, versionId, dataDir);
  await rm(dir, { recursive: true, force: true });
}
