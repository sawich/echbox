import {
  compareSemver,
  parseSemver,
  pickLatestBySemver,
  type CardDetail,
  type CardListItem,
} from "@echbox/shared";
import { and, count, eq, inArray } from "drizzle-orm";
import {
  orderBySort,
  resolveListWindow,
  titleSlugSearch,
  voteNetScore,
  type CatalogListQuery,
  type PaginatedList,
} from "../common/list-query";
import { getDb } from "../db/client";
import { newId } from "../id";
import { sceneVersions, sceneVotes, scenes, users } from "../db/schema";
import { KoikatuCharaData, KoikatuSceneData } from "../kkloader";
import { sha256Hex } from "../cards/hash";
import { writeWebpPreview } from "../cards/preview";
import {
  BadSceneError,
  DuplicateSceneHashError,
  DuplicateSceneSemverError,
  ForbiddenSceneError,
  SceneNotFoundError,
} from "./errors";
import {
  loadContentOriginal,
  storeContentOriginal,
  type ContentBlobOptions,
} from "../proxy/content-blob-service";
import {
  getVersionPaths,
  removeSceneFiles,
  removeVersionFiles,
} from "./storage";
import { assertGameSupportsKind } from "../games/service";
import {
  getVoteCounts,
  getVoteCountsForScenes,
  type VoteCounts,
} from "./votes";

export {
  BadSceneError,
  DuplicateSceneHashError,
  DuplicateSceneSemverError,
  ForbiddenSceneError,
  SceneNotFoundError,
  SceneServiceError,
} from "./errors";

export type SceneServiceOptions = ContentBlobOptions;

export type SceneVersionDetail = CardDetail["versions"][number] & {
  contentHash: string;
  originalPath: string | null;
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

export type ListScenesOptions = SceneServiceOptions &
  CatalogListQuery & {
    viewerUserId?: string | null;
    gameId?: string;
    authorId?: string;
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
  semver: string;
  notes?: string;
  /** Original upload filename — used when title is empty (scenes have no embedded name). */
  originalFilename?: string | null;
};

/** Basename without extension; empty string if nothing usable. */
export function filenameStem(filename: string | null | undefined): string {
  if (!filename) return "";
  const base = filename.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  if (!base || base === "." || base === "..") return "";
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).trim();
  return stem;
}

export type AddSceneVersionInput = SceneServiceOptions & {
  sceneId: string;
  authorId: string;
  fileBytes: Uint8Array;
  semver: string;
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

export type DeleteSceneVersionInput = SceneServiceOptions & {
  sceneId: string;
  versionId: string;
  authorId: string;
};

function imageUrl(sceneId: string, versionId: string | null): string {
  if (!versionId) return "";
  return `/api/scenes/${sceneId}/versions/${versionId}/image`;
}

function normalizeSemver(input: string | undefined): string {
  if (input === undefined || !input.trim()) {
    throw new BadSceneError("Version is required (for example 1.0.0).");
  }
  try {
    return parseSemver(input);
  } catch {
    throw new BadSceneError("Enter a valid version number (for example 1.0.0).");
  }
}

function slugify(input: string, fallbackId: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `scene-${fallbackId.slice(0, 8)}`;
}

function humanizeSceneParseError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (
    /out of bounds/i.test(message) ||
    /unexpected eof/i.test(message) ||
    /truncated msgpack/i.test(message) ||
    /invalid png/i.test(message) ||
    /negative length/i.test(message) ||
    /unexpected scene tail/i.test(message)
  ) {
    return "Uploaded file is not a valid Koikatsu scene";
  }
  return message || "Invalid Koikatsu scene";
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
    throw new BadSceneError(humanizeSceneParseError(err));
  }
}

export function findSceneByHash(
  hash: string,
  options?: SceneServiceOptions,
): { sceneId: string; versionId: string; semver: string } | null {
  const normalized = hash.trim().toLowerCase();
  if (!normalized) return null;

  const db = getDb(options?.dbPath);
  const row = db
    .select({
      sceneId: sceneVersions.sceneId,
      versionId: sceneVersions.id,
      semver: sceneVersions.semver,
    })
    .from(sceneVersions)
    .where(eq(sceneVersions.contentHash, normalized))
    .get();

  if (!row) return null;
  return {
    sceneId: row.sceneId,
    versionId: row.versionId,
    semver: row.semver,
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
    .all()
    .sort((a, b) => compareSemver(a.semver, b.semver));

  const versions: SceneVersionDetail[] = versionRows.map((v) => ({
    id: v.id,
    semver: v.semver,
    createdAt: v.createdAt,
    ...(v.notes != null ? { notes: v.notes } : {}),
    imageUrl: imageUrl(scene.id, v.id),
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
    latestSemver: scene.latestSemver,
    latestVersionId: scene.latestVersionId,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
    ...votes,
    versions,
  };
}

export async function listScenes(
  options?: ListScenesOptions,
): Promise<PaginatedList<SceneListItem>> {
  const db = getDb(options?.dbPath);
  const { page, limit, offset, sort, q, unbounded } = resolveListWindow(options);

  const whereClause = and(
    options?.gameId ? eq(scenes.gameId, options.gameId) : undefined,
    options?.authorId ? eq(scenes.authorId, options.authorId) : undefined,
    titleSlugSearch(scenes.title, scenes.slug, q),
  );
  const score = voteNetScore("scene_votes", "scene_id", scenes.id);
  const order = orderBySort(sort, scenes.createdAt, scenes.title, score);

  const total =
    db
      .select({ value: count() })
      .from(scenes)
      .where(whereClause)
      .get()?.value ?? 0;

  if (total === 0) {
    return { items: [], total: 0, page, limit: unbounded ? 0 : limit };
  }

  const rows = unbounded
    ? db
        .select()
        .from(scenes)
        .where(whereClause)
        .orderBy(...order)
        .all()
    : db
        .select()
        .from(scenes)
        .where(whereClause)
        .orderBy(...order)
        .limit(limit)
        .offset(offset)
        .all();

  const ids = rows.map((s) => s.id);
  const pageVersions =
    ids.length === 0
      ? []
      : db
          .select()
          .from(sceneVersions)
          .where(inArray(sceneVersions.sceneId, ids))
          .all();

  const versionsByScene = new Map<string, (typeof pageVersions)[number][]>();
  for (const v of pageVersions) {
    const arr = versionsByScene.get(v.sceneId) ?? [];
    arr.push(v);
    versionsByScene.set(v.sceneId, arr);
  }

  const voteMap = getVoteCountsForScenes(
    ids,
    options?.viewerUserId,
    options?.dbPath,
  );

  const items: SceneListItem[] = [];
  for (const scene of rows) {
    const versions = versionsByScene.get(scene.id) ?? [];
    const latestRow =
      versions.find((v) => v.id === scene.latestVersionId) ??
      pickLatestBySemver(versions) ??
      undefined;

    const summary = latestRow
      ? (JSON.parse(latestRow.summaryJson) as Record<string, unknown>)
      : {};

    const votes = voteMap.get(scene.id) ?? {
      likes: 0,
      dislikes: 0,
      myVote: null,
    };

    items.push({
      id: scene.id,
      gameId: scene.gameId,
      type: "scene",
      authorId: scene.authorId,
      slug: scene.slug,
      title: scene.title,
      latestSemver: scene.latestSemver,
      latestVersionId: scene.latestVersionId,
      versionCount: versions.length,
      imageUrl: imageUrl(scene.id, scene.latestVersionId),
      summary,
      ...votes,
    });
  }

  return {
    items,
    total,
    page: unbounded ? 1 : page,
    limit: unbounded ? total : limit,
  };
}

export async function createScene(
  input: CreateSceneInput,
): Promise<
  SceneDetail & {
    sceneId: string;
    versionId: string;
    semver: string;
    contentHash: string;
    originalPath: string | null;
    previewPath: string;
  }
> {
  const {
    authorId,
    gameId,
    title,
    slug,
    fileBytes,
    notes,
    originalFilename,
    dbPath,
    dataDir,
  } = input;

  const semver = normalizeSemver(input.semver);
  assertGameSupportsKind(gameId, "scenes", { dbPath });

  const contentHash = sha256Hex(fileBytes);
  const existing = findSceneByHash(contentHash, { dbPath });
  if (existing) {
    throw new DuplicateSceneHashError(
      existing.sceneId,
      existing.versionId,
      existing.semver,
    );
  }

  const ks = await parseScene(fileBytes);

  const sceneId = newId();
  const versionId = newId();
  const now = new Date().toISOString();

  const resolvedTitle =
    title?.trim() ||
    filenameStem(originalFilename) ||
    "Untitled Scene";
  const resolvedSlug = slug?.trim()
    ? slugify(slug, sceneId)
    : slugify(resolvedTitle, sceneId);

  const { previewPath } = getVersionPaths(
    sceneId,
    versionId,
    dataDir,
  );

  let previewSource = ks.image;
  if (!previewSource || previewSource.byteLength === 0) {
    previewSource = fileBytes;
  }

  await writeWebpPreview(previewSource, previewPath);
  await storeContentOriginal(contentHash, fileBytes, {
    dbPath,
    dataDir,
    transport: input.transport,
    telegramChatId: input.telegramChatId,
  });

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
        latestSemver: semver,
        latestVersionId: versionId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    tx.insert(sceneVersions)
      .values({
        id: versionId,
        sceneId,
        semver,
        notes: notes ?? null,
        contentHash,
        originalPath: null,
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
    versionId,
    semver,
    contentHash,
    originalPath: null,
    previewPath,
  };
}

export async function addSceneVersion(
  input: AddSceneVersionInput,
): Promise<
  SceneDetail & {
    sceneId: string;
    versionId: string;
    semver: string;
    contentHash: string;
    originalPath: string | null;
    previewPath: string;
  }
> {
  const { sceneId, authorId, fileBytes, notes, dbPath, dataDir } = input;
  const semver = normalizeSemver(input.semver);
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
    throw new DuplicateSceneHashError(
      existing.sceneId,
      existing.versionId,
      existing.semver,
    );
  }

  const duplicateSemver = db
    .select({ id: sceneVersions.id })
    .from(sceneVersions)
    .where(
      and(
        eq(sceneVersions.sceneId, sceneId),
        eq(sceneVersions.semver, semver),
      ),
    )
    .get();
  if (duplicateSemver) {
    throw new DuplicateSceneSemverError(sceneId, semver);
  }

  const ks = await parseScene(fileBytes);

  const versionId = newId();
  const now = new Date().toISOString();

  const { previewPath } = getVersionPaths(
    sceneId,
    versionId,
    dataDir,
  );

  let previewSource = ks.image;
  if (!previewSource || previewSource.byteLength === 0) {
    previewSource = fileBytes;
  }

  await writeWebpPreview(previewSource, previewPath);
  await storeContentOriginal(contentHash, fileBytes, {
    dbPath,
    dataDir,
    transport: input.transport,
    telegramChatId: input.telegramChatId,
  });

  const summaryJson = JSON.stringify(ks.summary());

  db.transaction((tx) => {
    tx.insert(sceneVersions)
      .values({
        id: versionId,
        sceneId,
        semver,
        notes: notes ?? null,
        contentHash,
        originalPath: null,
        previewPath,
        summaryJson,
        createdAt: now,
      })
      .run();

    const allVersions = tx
      .select({ id: sceneVersions.id, semver: sceneVersions.semver })
      .from(sceneVersions)
      .where(eq(sceneVersions.sceneId, sceneId))
      .all();
    const latest = pickLatestBySemver(allVersions)!;

    tx.update(scenes)
      .set({
        latestSemver: latest.semver,
        latestVersionId: latest.id,
        updatedAt: now,
      })
      .where(eq(scenes.id, sceneId))
      .run();
  });

  const detail = await getScene(sceneId, { dbPath, dataDir });
  return {
    ...detail!,
    sceneId,
    versionId,
    semver,
    contentHash,
    originalPath: null,
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

    if (input.notes !== undefined && scene.latestVersionId) {
      tx.update(sceneVersions)
        .set({
          notes: input.notes,
        })
        .where(
          and(
            eq(sceneVersions.sceneId, targetId),
            eq(sceneVersions.id, scene.latestVersionId),
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

export async function deleteSceneVersion(
  input: DeleteSceneVersionInput,
): Promise<SceneDetail> {
  const { sceneId, versionId, authorId, dbPath, dataDir } = input;
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

  const version = db
    .select()
    .from(sceneVersions)
    .where(
      and(
        eq(sceneVersions.sceneId, sceneId),
        eq(sceneVersions.id, versionId),
      ),
    )
    .get();

  if (!version) {
    throw new SceneNotFoundError("Version not found");
  }

  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.delete(sceneVersions).where(eq(sceneVersions.id, versionId)).run();

    const remaining = tx
      .select({ id: sceneVersions.id, semver: sceneVersions.semver })
      .from(sceneVersions)
      .where(eq(sceneVersions.sceneId, sceneId))
      .all();

    const latest = pickLatestBySemver(remaining);

    tx.update(scenes)
      .set({
        latestSemver: latest?.semver ?? null,
        latestVersionId: latest?.id ?? null,
        updatedAt: now,
      })
      .where(eq(scenes.id, sceneId))
      .run();
  });

  await removeVersionFiles(sceneId, versionId, dataDir);

  const detail = await getScene(sceneId, { dbPath, dataDir });
  return detail!;
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
  versionId: string,
  options?: SceneServiceOptions & { original?: boolean },
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const db = getDb(options?.dbPath);
  const row = db
    .select()
    .from(sceneVersions)
    .where(
      and(
        eq(sceneVersions.sceneId, sceneId),
        eq(sceneVersions.id, versionId),
      ),
    )
    .get();

  if (!row) return null;

  if (options?.original) {
    const bytes = await loadContentOriginal(row.contentHash, row.originalPath, {
      dbPath: options?.dbPath,
      dataDir: options?.dataDir,
      transport: options?.transport,
      telegramChatId: options?.telegramChatId,
    });
    if (!bytes) return null;
    return {
      bytes,
      contentType: "image/png",
    };
  }

  const file = Bun.file(row.previewPath);
  if (!(await file.exists())) return null;

  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    contentType: "image/webp",
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
    deleteSceneVersion: (
      input: Omit<DeleteSceneVersionInput, "dbPath" | "dataDir">,
    ) => deleteSceneVersion({ ...options, ...input }),
    getSceneVersionImage: (
      sceneId: string,
      versionId: string,
      opts?: { original?: boolean },
    ) => getSceneVersionImage(sceneId, versionId, { ...options, ...opts }),
  };
}
