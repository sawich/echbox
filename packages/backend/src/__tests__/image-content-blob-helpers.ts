import { getDb } from "../db/client";
import {
  characterCardVersions,
  characterCards,
  clothes,
  clothesVersions,
  sceneVersions,
  scenes,
} from "../db/schema";
import { sha256Hex } from "../cards/hash";
import { putContentBlob } from "../proxy/blob-store";
import { createFakeTransport } from "../proxy/__tests__/helpers";
import { getVersionPaths as getCardVersionPaths } from "../cards/storage";
import { getVersionPaths as getSceneVersionPaths } from "../scenes/storage";
import { getVersionPaths as getClothesVersionPaths } from "../clothes/storage";

const TEST_CHAT_ID = "-100999";

/** Minimal RIFF/WEBP header so preview path checks stay meaningful. */
export function minimalWebpPreviewBytes(): Uint8Array {
  const buf = new Uint8Array(16);
  buf.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 0);
  return buf;
}

export async function storeTestContentBlob(
  fileBytes: Uint8Array,
  dbPath: string,
  dataDir: string,
): Promise<string> {
  const contentHash = sha256Hex(fileBytes);
  await putContentBlob({
    contentHash,
    original: fileBytes,
    dbPath,
    dataDir,
    transport: createFakeTransport(),
    chatId: TEST_CHAT_ID,
  });
  return contentHash;
}

type Db = ReturnType<typeof getDb>;

export async function plantCardVersionWithBlob(
  db: Db,
  input: {
    gameId: string;
    uploaderId: string;
    dbPath: string;
    dataDir: string;
    fileBytes?: Uint8Array;
  },
): Promise<{
  cardId: string;
  versionId: string;
  contentHash: string;
  fileBytes: Uint8Array;
}> {
  const fileBytes =
    input.fileBytes ?? new TextEncoder().encode("card-blob-retention");
  const contentHash = await storeTestContentBlob(
    fileBytes,
    input.dbPath,
    input.dataDir,
  );
  const cardId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { previewPath } = getCardVersionPaths(cardId, versionId, input.dataDir);
  await Bun.write(previewPath, minimalWebpPreviewBytes());

  db.insert(characterCards)
    .values({
      id: cardId,
      gameId: input.gameId,
      uploaderId: input.uploaderId,
      description: "",
      latestSemver: "1.0.0",
      latestVersionId: versionId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(characterCardVersions)
    .values({
      id: versionId,
      cardId,
      semver: "1.0.0",
      notes: null,
      contentHash,
      originalPath: null,
      previewPath,
      summaryJson: "{}",
      createdAt: now,
    })
    .run();

  return { cardId, versionId, contentHash, fileBytes };
}

export async function plantLegacyCardVersionOnDisk(
  db: Db,
  input: {
    gameId: string;
    uploaderId: string;
    dataDir: string;
    fileBytes?: Uint8Array;
  },
): Promise<{
  cardId: string;
  versionId: string;
  contentHash: string;
  fileBytes: Uint8Array;
}> {
  const fileBytes =
    input.fileBytes ?? new TextEncoder().encode("card-legacy-disk");
  const contentHash = sha256Hex(fileBytes);
  const cardId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { originalPath, previewPath } = getCardVersionPaths(
    cardId,
    versionId,
    input.dataDir,
  );
  await Bun.write(originalPath, fileBytes);
  await Bun.write(previewPath, minimalWebpPreviewBytes());

  db.insert(characterCards)
    .values({
      id: cardId,
      gameId: input.gameId,
      uploaderId: input.uploaderId,
      description: "",
      latestSemver: "1.0.0",
      latestVersionId: versionId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(characterCardVersions)
    .values({
      id: versionId,
      cardId,
      semver: "1.0.0",
      notes: null,
      contentHash,
      originalPath,
      previewPath,
      summaryJson: "{}",
      createdAt: now,
    })
    .run();

  return { cardId, versionId, contentHash, fileBytes };
}

export async function plantSceneVersionWithBlob(
  db: Db,
  input: {
    gameId: string;
    uploaderId: string;
    dbPath: string;
    dataDir: string;
    fileBytes?: Uint8Array;
  },
): Promise<{
  sceneId: string;
  versionId: string;
  contentHash: string;
  fileBytes: Uint8Array;
}> {
  const fileBytes =
    input.fileBytes ?? new TextEncoder().encode("scene-blob-retention");
  const contentHash = await storeTestContentBlob(
    fileBytes,
    input.dbPath,
    input.dataDir,
  );
  const sceneId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { previewPath } = getSceneVersionPaths(sceneId, versionId, input.dataDir);
  await Bun.write(previewPath, minimalWebpPreviewBytes());

  db.insert(scenes)
    .values({
      id: sceneId,
      gameId: input.gameId,
      uploaderId: input.uploaderId,
      description: "",
      latestSemver: "1.0.0",
      latestVersionId: versionId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(sceneVersions)
    .values({
      id: versionId,
      sceneId,
      semver: "1.0.0",
      notes: null,
      contentHash,
      originalPath: null,
      previewPath,
      summaryJson: "{}",
      createdAt: now,
    })
    .run();

  return { sceneId, versionId, contentHash, fileBytes };
}

export async function plantLegacySceneVersionOnDisk(
  db: Db,
  input: {
    gameId: string;
    uploaderId: string;
    dataDir: string;
    fileBytes?: Uint8Array;
  },
): Promise<{
  sceneId: string;
  versionId: string;
  contentHash: string;
  fileBytes: Uint8Array;
}> {
  const fileBytes =
    input.fileBytes ?? new TextEncoder().encode("scene-legacy-disk");
  const contentHash = sha256Hex(fileBytes);
  const sceneId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { originalPath, previewPath } = getSceneVersionPaths(
    sceneId,
    versionId,
    input.dataDir,
  );
  await Bun.write(originalPath, fileBytes);
  await Bun.write(previewPath, minimalWebpPreviewBytes());

  db.insert(scenes)
    .values({
      id: sceneId,
      gameId: input.gameId,
      uploaderId: input.uploaderId,
      description: "",
      latestSemver: "1.0.0",
      latestVersionId: versionId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(sceneVersions)
    .values({
      id: versionId,
      sceneId,
      semver: "1.0.0",
      notes: null,
      contentHash,
      originalPath,
      previewPath,
      summaryJson: "{}",
      createdAt: now,
    })
    .run();

  return { sceneId, versionId, contentHash, fileBytes };
}

export async function plantClothesVersionWithBlob(
  db: Db,
  input: {
    gameId: string;
    uploaderId: string;
    dbPath: string;
    dataDir: string;
    fileBytes?: Uint8Array;
  },
): Promise<{
  clothesId: string;
  versionId: string;
  contentHash: string;
  fileBytes: Uint8Array;
}> {
  const fileBytes =
    input.fileBytes ?? new TextEncoder().encode("clothes-blob-retention");
  const contentHash = await storeTestContentBlob(
    fileBytes,
    input.dbPath,
    input.dataDir,
  );
  const clothesId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { previewPath } = getClothesVersionPaths(
    clothesId,
    versionId,
    input.dataDir,
  );
  await Bun.write(previewPath, minimalWebpPreviewBytes());

  db.insert(clothes)
    .values({
      id: clothesId,
      gameId: input.gameId,
      uploaderId: input.uploaderId,
      description: "",
      latestSemver: "1.0.0",
      latestVersionId: versionId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(clothesVersions)
    .values({
      id: versionId,
      clothesId,
      semver: "1.0.0",
      notes: null,
      contentHash,
      originalPath: null,
      previewPath,
      summaryJson: "{}",
      createdAt: now,
    })
    .run();

  return { clothesId, versionId, contentHash, fileBytes };
}

export async function plantLegacyClothesVersionOnDisk(
  db: Db,
  input: {
    gameId: string;
    uploaderId: string;
    dataDir: string;
    fileBytes?: Uint8Array;
  },
): Promise<{
  clothesId: string;
  versionId: string;
  contentHash: string;
  fileBytes: Uint8Array;
}> {
  const fileBytes =
    input.fileBytes ?? new TextEncoder().encode("clothes-legacy-disk");
  const contentHash = sha256Hex(fileBytes);
  const clothesId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { originalPath, previewPath } = getClothesVersionPaths(
    clothesId,
    versionId,
    input.dataDir,
  );
  await Bun.write(originalPath, fileBytes);
  await Bun.write(previewPath, minimalWebpPreviewBytes());

  db.insert(clothes)
    .values({
      id: clothesId,
      gameId: input.gameId,
      uploaderId: input.uploaderId,
      description: "",
      latestSemver: "1.0.0",
      latestVersionId: versionId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(clothesVersions)
    .values({
      id: versionId,
      clothesId,
      semver: "1.0.0",
      notes: null,
      contentHash,
      originalPath,
      previewPath,
      summaryJson: "{}",
      createdAt: now,
    })
    .run();

  return { clothesId, versionId, contentHash, fileBytes };
}
