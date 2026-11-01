import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { sha256Hex } from "../cards/hash";
import { loadSeed, resolveFixture, type SeedCard } from "../gallery/seed";
import {
  addSceneVersion,
  createScene,
  findSceneByHash,
  type SceneServiceOptions,
} from "./service";

export const ECHBOX_SYSTEM_USER = {
  id: "e0cb0000-0000-4000-8000-000000000001",
  discordId: "system:echbox",
  username: "echbox",
} as const;

export type EchboxUser = {
  id: string;
  discordId: string;
  username: string;
  avatar: string | null;
  createdAt: string;
};

export function ensureEchboxUser(dbPath?: string): EchboxUser {
  const db = getDb(dbPath);
  const existing = db
    .select()
    .from(users)
    .where(eq(users.discordId, ECHBOX_SYSTEM_USER.discordId))
    .get();

  if (existing) {
    if (existing.username !== ECHBOX_SYSTEM_USER.username) {
      db.update(users)
        .set({ username: ECHBOX_SYSTEM_USER.username })
        .where(eq(users.id, existing.id))
        .run();
    }
    return {
      ...existing,
      username: ECHBOX_SYSTEM_USER.username,
    };
  }

  const now = new Date().toISOString();
  const row = {
    id: ECHBOX_SYSTEM_USER.id,
    discordId: ECHBOX_SYSTEM_USER.discordId,
    username: ECHBOX_SYSTEM_USER.username,
    avatar: null as string | null,
    createdAt: now,
  };
  db.insert(users).values(row).run();
  return row;
}

async function loadFixtureBytes(relative: string): Promise<Uint8Array> {
  const path = resolveFixture(relative);
  return new Uint8Array(await Bun.file(path).arrayBuffer());
}

function sceneSeedCards(): SeedCard[] {
  return loadSeed().filter((c) => c.type === "scene");
}

export type ImportSeedScenesResult = {
  imported: number;
  skipped: number;
};

export type ImportSeedScenesOptions = SceneServiceOptions & {
  gameId: string;
};

export async function importSeedScenes(
  options: ImportSeedScenesOptions,
): Promise<ImportSeedScenesResult> {
  const { dbPath, dataDir, gameId } = options;
  ensureEchboxUser(dbPath);

  let imported = 0;
  let skipped = 0;

  for (const card of sceneSeedCards()) {
    const versions = [...card.versions].sort((a, b) => a.version - b.version);
    let sceneId: string | null = null;

    for (const ver of versions) {
      const fileBytes = await loadFixtureBytes(ver.fixture);
      const hash = sha256Hex(fileBytes);
      const existing = findSceneByHash(hash, { dbPath });

      if (existing) {
        skipped++;
        sceneId = existing.sceneId;
        continue;
      }

      const title = card.title?.trim() || undefined;
      const notes = ver.notes;

      if (ver.version === 1 || sceneId === null) {
        const created = await createScene({
          authorId: ECHBOX_SYSTEM_USER.id,
          gameId,
          title,
          slug: card.slug,
          fileBytes,
          notes,
          dbPath,
          dataDir,
        });
        sceneId = created.sceneId;
        imported++;
      } else {
        await addSceneVersion({
          sceneId,
          authorId: ECHBOX_SYSTEM_USER.id,
          fileBytes,
          notes,
          dbPath,
          dataDir,
        });
        imported++;
      }
    }
  }

  return { imported, skipped };
}
