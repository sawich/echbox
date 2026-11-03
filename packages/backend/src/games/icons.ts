import { rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getDataDir } from "../cards/storage";
import { BadGameError } from "./errors";

export const GAME_ICON_SIZES = [32, 64, 128, 256] as const;
export type GameIconSize = (typeof GAME_ICON_SIZES)[number];

const WEBP_QUALITY = 80;

export type GameIconUrls = Record<`${GameIconSize}`, string>;

export function gameIconsDir(gameId: string, dataDir?: string): string {
  return join(getDataDir(dataDir), "public", "games", gameId, "icons");
}

export function gameIconUrls(gameId: string): GameIconUrls {
  return {
    "32": `/api/games/${gameId}/icons/32`,
    "64": `/api/games/${gameId}/icons/64`,
    "128": `/api/games/${gameId}/icons/128`,
    "256": `/api/games/${gameId}/icons/256`,
  };
}

export function parseIconSize(raw: string): GameIconSize | null {
  const n = Number(raw);
  return (GAME_ICON_SIZES as readonly number[]).includes(n)
    ? (n as GameIconSize)
    : null;
}

export function iconWebpPath(
  gameId: string,
  size: GameIconSize,
  dataDir?: string,
): string {
  return join(gameIconsDir(gameId, dataDir), `${size}.webp`);
}

export function iconSourcePath(gameId: string, dataDir?: string): string {
  return join(gameIconsDir(gameId, dataDir), "source.png");
}

function assertPng(bytes: Uint8Array): void {
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    throw new BadGameError("Icon must be a PNG image");
  }
}

export async function writeGameIcons(
  gameId: string,
  pngBytes: Uint8Array,
  dataDir?: string,
): Promise<void> {
  assertPng(pngBytes);
  const dir = gameIconsDir(gameId, dataDir);
  await mkdir(dir, { recursive: true });
  await Bun.write(iconSourcePath(gameId, dataDir), pngBytes);

  for (const size of GAME_ICON_SIZES) {
    const img = new Bun.Image(pngBytes);
    await img.metadata();
    const maxEdge = Math.max(img.width, img.height);
    const scale = Math.min(1, size / maxEdge);
    const pipeline =
      scale < 1
        ? img.resize(
            Math.max(1, Math.round(img.width * scale)),
            Math.max(1, Math.round(img.height * scale)),
          )
        : img;
    await pipeline
      .webp({ quality: WEBP_QUALITY })
      .write(iconWebpPath(gameId, size, dataDir));
  }
}

export function removeGameIcons(gameId: string, dataDir?: string): void {
  rmSync(gameIconsDir(gameId, dataDir), { recursive: true, force: true });
}

export async function readGameIconWebp(
  gameId: string,
  size: GameIconSize,
  dataDir?: string,
): Promise<Uint8Array | null> {
  const path = iconWebpPath(gameId, size, dataDir);
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return new Uint8Array(await file.arrayBuffer());
}
