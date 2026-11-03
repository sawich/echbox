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

export function getSceneDir(sceneId: string, dataDir?: string): string {
  return join(getDataDir(dataDir), "scenes", sceneId);
}

export function getVersionDir(
  sceneId: string,
  versionId: string,
  dataDir?: string,
): string {
  return join(getSceneDir(sceneId, dataDir), versionId);
}

export type VersionPaths = {
  versionDir: string;
  originalPath: string;
  previewPath: string;
};

export function getVersionPaths(
  sceneId: string,
  versionId: string,
  dataDir?: string,
): VersionPaths {
  const versionDir = getVersionDir(sceneId, versionId, dataDir);
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

export async function removeSceneFiles(
  sceneId: string,
  dataDir?: string,
): Promise<void> {
  const dir = getSceneDir(sceneId, dataDir);
  await rm(dir, { recursive: true, force: true });
}
