import type { CardDetail, CardListItem } from "@echbox/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { sceneVersions, sceneVotes, scenes, users } from "../db/schema";
import { KoikatuCharaData, KoikatuSceneData } from "../kkloader";
import { sha256Hex } from "../cards/hash";
import { writeWebpPreview } from "../cards/preview";
import {
  BadSceneError,
  DuplicateSceneHashError,
  ForbiddenSceneError,
  SceneNotFoundError,
} from "./errors";
import {
  getVersionPaths,
  removeSceneFiles,
  writeOriginalPng,
} from "./storage";
import { assertGameExists } from "../games/service";
import {
  getVoteCounts,
  getVoteCountsForScenes,
  type VoteCounts,
} from "./votes";

export {
  BadSceneError,
  DuplicateSceneHashError,
  ForbiddenSceneError,
  SceneNotFoundError,
  SceneServiceError,
} from "./errors";

export type SceneServiceOptions = {
  dbPath?: string;
  dataDir?: string;
};

export type SceneVersionDetail = CardDetail["versions"][number] & {
  contentHash: string;
  originalPath: string;
  previewPath: string;
};

export type SceneDetail = Omit<CardDetail, "versions"> &
  VoteCounts & {
    gameId: string;
    authorId: string;
    authorUsername?: string | null;
    authorAvatar?: string | null;
    createdAt: string;
    updatedAt: string;
    versions: SceneVersionDetail[];
  };

export type SceneListItem = CardListItem &
  VoteCounts & {
    gameId: string;
    authorId: string;
  };

export type ListScenesOptions = SceneServiceOptions & {
  viewerUserId?: string | null;
  gameId?: string;
};

export type GetSceneOptions = SceneServiceOptions & {
  viewerUserId?: string | null;
};

export type CreateSceneInput = SceneServiceOptions & {
  authorId: string;
  gameId: string;
  title?: string;
  slug?: string;
  fileBytes: Uint8Array;
  notes?: string;
};

export type AddSceneVersionInput = SceneServiceOptions & {
  sceneId: string;
  authorId: string;
  fileBytes: Uint8Array;
  notes?: string;
};

export type PatchSceneInput = SceneServiceOptions & {
  sceneId?: string;
  id?: string;
  authorId: string;
  title?: string;
  slug?: string;
  notes?: string;
};

export type DeleteSceneInput = SceneServiceOptions & {
  sceneId?: string;
  id?: string;
  authorId: string;
};

function imageUrl(sceneId: string, version: number): string {
  return `/api/scenes/${sceneId}/versions/${version}/image`;
}

function slugify(input: string, fallbackId: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `scene-${fallbackId.slice(0, 8)}`;
}

async function parseScene(fileBytes: Uint8Array): Promise<KoikatuSceneData> {
  try {
    const kc = await KoikatuCharaData.load(fileBytes);
    const summary = kc.summary();
    if (summary.header.includes("KoiKatuChara") && kc.blockdata.length > 0) {
      throw new BadSceneError("Uploaded file is not a valid Koikatsu scene");
    }
  } catch (err) {
    if (err instanceof BadSceneError) throw err;
  }

  try {
    const ks = await KoikatuSceneData.load(fileBytes);
    if (!ks.version?.trim()) {
      throw new BadSceneError("Uploaded file is not a valid Koikatsu scene");
    }
    return ks;
  } catch (err) {
    if (err instanceof BadSceneError) throw err;
    throw new BadSceneError(
      err instanceof Error ? err.message : "Invalid Koikatsu scene",
    );
  }
}

export function findSceneByHash(
  hash: string,
  options?: SceneServiceOptions,
): { sceneId: string; version: number } | null {
  const normalized = hash.trim().toLowerCase();
  if (!normalized) return null;

  const db = getDb(options?.dbPath);
  const row = db
    .select({
      sceneId: sceneVersions.sceneId,
      version: sceneVersions.version,
    })
    .from(sceneVersions)
    .where(eq(sceneVersions.contentHash, normalized))
    .get();

  if (!row) return null;
  return {
    sceneId: row.sceneId,
    version: row.version,
  };
}

export async function getScene(
  id: string,
  options?: GetSceneOptions,
): Promise<SceneDetail | null> {
  const db = getDb(options?.dbPath);
  const scene = db
    .select()
    .from(scenes)
    .where(eq(scenes.id, id))
    .get();

  if (!scene) return null;

  const versionRows = db
    .select()
    .from(sceneVersions)
    .where(eq(sceneVersions.sceneId, id))
    .orderBy(asc(sceneVersions.version))
    .all();

  const versions: SceneVersionDetail[] = versionRows.map((v) => ({
    version: v.version,
    createdAt: v.createdAt,
    ...(v.notes != null ? { notes: v.notes } : {}),
    imageUrl: imageUrl(scene.id, v.version),
    summary: JSON.parse(v.summaryJson) as Record<string, unknown>,
    contentHash: v.contentHash,
    originalPath: v.originalPath,
    previewPath: v.previewPath,
  }));

  const votes = getVoteCounts(scene.id, options?.viewerUserId, options?.dbPath);
  const author = db
    .select({
      username: users.username,
      avatar: users.avatar,
    })
    .from(users)
    .where(eq(users.id, scene.authorId))
    .get();

  return {
    id: scene.id,
    gameId: scene.gameId,
    type: "scene",
    authorId: scene.authorId,
    authorUsername: author?.username ?? null,
    authorAvatar: author?.avatar ?? null,
    slug: scene.slug,
    title: scene.title,
    latestVersion: scene.latestVersion,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
    ...votes,
    versions,
  };
}

export async function listScenes(
  options?: ListScenesOptions,
): Promise<SceneListItem[]> {
  const db = getDb(options?.dbPath);
  const rows = options?.gameId
    ? db
        .select()
        .from(scenes)
        .where(eq(scenes.gameId, options.gameId))
        .orderBy(desc(scenes.createdAt))
        .all()
    : db
        .select()
        .from(scenes)
        .orderBy(desc(scenes.createdAt))
        .all();

  if (rows.length === 0) return [];

  const allVersions = db.select().from(sceneVersions).all();

  const versionsByScene = new Map<string, (typeof allVersions)[number][]>();
  for (const v of allVersions) {
    const arr = versionsByScene.get(v.sceneId) ?? [];
    arr.push(v);
    versionsByScene.set(v.sceneId, arr);
  }

  const voteMap = getVoteCountsForScenes(
    rows.map((s) => s.id),
    options?.viewerUserId,
    options?.dbPath,
  );

  const out: SceneListItem[] = [];
  for (const scene of rows) {
    const versions = versionsByScene.get(scene.id) ?? [];
    const latestRow =
      versions.find((v) => v.version === scene.latestVersion) ??
      versions.reduce<(typeof versions)[number] | undefined>(
        (best, cur) => (!best || cur.version > best.version ? cur : best),
        undefined,
      );

    const summary = latestRow
      ? (JSON.parse(latestRow.summaryJson) as Record<string, unknown>)
      : {};

    const votes = voteMap.get(scene.id) ?? {
      likes: 0,
      dislikes: 0,
      myVote: null,
    };

    out.push({
      id: scene.id,
      gameId: scene.gameId,
      type: "scene",
      authorId: scene.authorId,
      slug: scene.slug,
      title: scene.title,
      latestVersion: scene.latestVersion,
      versionCount: versions.length || 1,
      imageUrl: imageUrl(scene.id, scene.latestVersion),
      summary,
      ...votes,
    });
  }

  return out;
}

export async function createScene(
  input: CreateSceneInput,
): Promise<
  SceneDetail & {
    sceneId: string;
    version: number;
    contentHash: string;
    originalPath: string;
    previewPath: string;
  }
> {
  const { authorId, gameId, title, slug, fileBytes, notes, dbPath, dataDir } =
    input;

  assertGameExists(gameId, { dbPath });

  const contentHash = sha256Hex(fileBytes);
  const existing = findSceneByHash(contentHash, { dbPath });
  if (existing) {
    throw new DuplicateSceneHashError(existing.sceneId, existing.version);
  }

  const ks = await parseScene(fileBytes);

  const sceneId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const version = 1;
  const now = new Date().toISOString();

  const resolvedTitle = title?.trim() || "Untitled Scene";
  const resolvedSlug = slug?.trim()
    ? slugify(slug, sceneId)
    : slugify(resolvedTitle, sceneId);

  const { originalPath, previewPath } = getVersionPaths(sceneId, version, dataDir);

  let previewSource = ks.image;
  if (!previewSource || previewSource.byteLength === 0) {
    previewSource = fileBytes;
  }

  await writeWebpPreview(previewSource, previewPath);
  await writeOriginalPng(fileBytes, originalPath);

  const db = getDb(dbPath);
  const summaryJson = JSON.stringify(ks.summary());

  db.transaction((tx) => {
    tx.insert(scenes)
      .values({
        id: sceneId,
        gameId,
        authorId,
        slug: resolvedSlug,
        title: resolvedTitle,
        latestVersion: version,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    tx.insert(sceneVersions)
      .values({
        id: versionId,
        sceneId,
        version,
        notes: notes ?? null,
        contentHash,
        originalPath,
        previewPath,
        summaryJson,
        createdAt: now,
      })
      .run();
  });

  const detail = await getScene(sceneId, { dbPath, dataDir });
  return {
    ...detail!,
    sceneId,
    version,
    contentHash,
    originalPath,
    previewPath,
  };
}

export async function addSceneVersion(
  input: AddSceneVersionInput,
): Promise<
  SceneDetail & {
    sceneId: string;
    version: number;
    contentHash: string;
    originalPath: string;
    previewPath: string;
  }
> {
  const { sceneId, authorId, fileBytes, notes, dbPath, dataDir } = input;
  const db = getDb(dbPath);

  const scene = db
    .select()
    .from(scenes)
    .where(eq(scenes.id, sceneId))
    .get();

  if (!scene) {
    throw new SceneNotFoundError();
  }

  if (scene.authorId !== authorId) {
    throw new ForbiddenSceneError();
  }

  const contentHash = sha256Hex(fileBytes);
  const existing = findSceneByHash(contentHash, { dbPath });
  if (existing) {
    throw new DuplicateSceneHashError(existing.sceneId, existing.version);
  }

  const ks = await parseScene(fileBytes);

  const nextVersion = scene.latestVersion + 1;
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { originalPath, previewPath } = getVersionPaths(
    sceneId,
    nextVersion,
    dataDir,
  );

  let previewSource = ks.image;
  if (!previewSource || previewSource.byteLength === 0) {
    previewSource = fileBytes;
  }

  await writeWebpPreview(previewSource, previewPath);
  await writeOriginalPng(fileBytes, originalPath);

  const summaryJson = JSON.stringify(ks.summary());

  db.transaction((tx) => {
    tx.insert(sceneVersions)
      .values({
        id: versionId,
        sceneId,
        version: nextVersion,
        notes: notes ?? null,
        contentHash,
        originalPath,
        previewPath,
        summaryJson,
        createdAt: now,
      })
      .run();

    tx.update(scenes)
      .set({
        latestVersion: nextVersion,
        updatedAt: now,
      })
      .where(eq(scenes.id, sceneId))
      .run();
  });

  const detail = await getScene(sceneId, { dbPath, dataDir });
  return {
    ...detail!,
    sceneId,
    version: nextVersion,
    contentHash,
    originalPath,
    previewPath,
  };
}

export async function patchScene(
  sceneIdOrInput: string | PatchSceneInput,
  maybePatch?: Omit<PatchSceneInput, "sceneId" | "id">,
): Promise<SceneDetail> {
  const input: PatchSceneInput =
    typeof sceneIdOrInput === "string"
      ? { sceneId: sceneIdOrInput, ...maybePatch! }
      : sceneIdOrInput;

  const targetId = input.sceneId ?? input.id;
  if (!targetId) {
    throw new SceneNotFoundError("Missing sceneId");
  }

  const db = getDb(input.dbPath);
  const scene = db
    .select()
    .from(scenes)
    .where(eq(scenes.id, targetId))
    .get();

  if (!scene) {
    throw new SceneNotFoundError();
  }

  if (scene.authorId !== input.authorId) {
    throw new ForbiddenSceneError();
  }

  const now = new Date().toISOString();
  const nextTitle = input.title?.trim() ? input.title.trim() : scene.title;
  const nextSlug = input.slug?.trim()
    ? slugify(input.slug, targetId)
    : input.title?.trim() && input.slug === undefined
      ? scene.slug
      : scene.slug;

  db.transaction((tx) => {
    tx.update(scenes)
      .set({
        title: nextTitle,
        slug: nextSlug,
        updatedAt: now,
      })
      .where(eq(scenes.id, targetId))
      .run();

    if (input.notes !== undefined) {
      tx.update(sceneVersions)
        .set({
          notes: input.notes,
        })
        .where(
          and(
            eq(sceneVersions.sceneId, targetId),
            eq(sceneVersions.version, scene.latestVersion),
          ),
        )
        .run();
    }
  });

  const updated = await getScene(targetId, {
    dbPath: input.dbPath,
    dataDir: input.dataDir,
  });
  return updated!;
}

export async function deleteScene(
  sceneIdOrInput: string | DeleteSceneInput,
  maybeAuthorOrInput?: string | Omit<DeleteSceneInput, "sceneId" | "id">,
): Promise<{ ok: true; id: string }> {
  const input: DeleteSceneInput =
    typeof sceneIdOrInput === "string"
      ? typeof maybeAuthorOrInput === "string"
        ? { sceneId: sceneIdOrInput, authorId: maybeAuthorOrInput }
        : { sceneId: sceneIdOrInput, ...maybeAuthorOrInput! }
      : sceneIdOrInput;

  const targetId = input.sceneId ?? input.id;
  if (!targetId) {
    throw new SceneNotFoundError("Missing sceneId");
  }

  const db = getDb(input.dbPath);
  const scene = db
    .select()
    .from(scenes)
    .where(eq(scenes.id, targetId))
    .get();

  if (!scene) {
    throw new SceneNotFoundError();
  }

  if (scene.authorId !== input.authorId) {
    throw new ForbiddenSceneError();
  }

  db.transaction((tx) => {
    tx.delete(sceneVotes).where(eq(sceneVotes.sceneId, targetId)).run();
    tx.delete(sceneVersions).where(eq(sceneVersions.sceneId, targetId)).run();
    tx.delete(scenes).where(eq(scenes.id, targetId)).run();
  });

  await removeSceneFiles(targetId, input.dataDir);

  return { ok: true, id: targetId };
}

export async function getSceneVersionImage(
  sceneId: string,
  version: number,
  options?: SceneServiceOptions & { original?: boolean },
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const db = getDb(options?.dbPath);
  const row = db
    .select()
    .from(sceneVersions)
    .where(
      and(
        eq(sceneVersions.sceneId, sceneId),
        eq(sceneVersions.version, version),
      ),
    )
    .get();

  if (!row) return null;

  const filePath = options?.original ? row.originalPath : row.previewPath;
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;

  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    contentType: options?.original ? "image/png" : "image/webp",
  };
}

export function createSceneService(options: SceneServiceOptions = {}) {
  return {
    createScene: (input: Omit<CreateSceneInput, "dbPath" | "dataDir">) =>
      createScene({ ...options, ...input }),
    addSceneVersion: (input: Omit<AddSceneVersionInput, "dbPath" | "dataDir">) =>
      addSceneVersion({ ...options, ...input }),
    findSceneByHash: (hash: string) => findSceneByHash(hash, options),
    listScenes: () => listScenes(options),
    getScene: (id: string, opts?: { viewerUserId?: string | null }) =>
      getScene(id, { ...options, ...opts }),
    patchScene: (
      sceneIdOrInput: string | PatchSceneInput,
      maybePatch?: Omit<PatchSceneInput, "sceneId" | "id">,
    ) => {
      if (typeof sceneIdOrInput === "string") {
        return patchScene(sceneIdOrInput, { ...options, ...maybePatch! });
      }
      return patchScene({ ...options, ...sceneIdOrInput });
    },
    deleteScene: (
      sceneIdOrInput: string | DeleteSceneInput,
      maybeAuthorOrInput?: string | Omit<DeleteSceneInput, "sceneId" | "id">,
    ) => {
      if (typeof sceneIdOrInput === "string") {
        if (typeof maybeAuthorOrInput === "string") {
          return deleteScene({
            ...options,
            sceneId: sceneIdOrInput,
            authorId: maybeAuthorOrInput,
          });
        }
        return deleteScene(sceneIdOrInput, { ...options, ...maybeAuthorOrInput! });
      }
      return deleteScene({ ...options, ...sceneIdOrInput });
    },
    getSceneVersionImage: (
      sceneId: string,
      version: number,
      opts?: { original?: boolean },
    ) => getSceneVersionImage(sceneId, version, { ...options, ...opts }),
  };
}
