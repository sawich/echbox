import { compareSemver, parseSemver, pickLatestBySemver } from "@echbox/shared";
import { and, desc, eq } from "drizzle-orm";
import { sha256Hex } from "../cards/hash";
import { assertNonEmptyZip } from "../common/zip";
import {
  discardStaged,
  isUniqueConstraintError,
  stageUpload,
} from "../common/staging";
import { getDb } from "../db/client";
import { newId } from "../id";
import { pluginVersions, pluginVotes, plugins, users } from "../db/schema";
import {
  BadPluginError,
  DuplicatePluginHashError,
  DuplicatePluginSemverError,
  ForbiddenPluginError,
  PluginNotFoundError,
} from "./errors";
import {
  getPluginsRoot,
  placeStagedZip,
  pluginVersionPaths,
  removePlacedFile,
  removePluginFiles,
} from "./storage";
import { assertGameExists } from "../games/service";
import {
  getPluginVoteCounts,
  getPluginVoteCountsForPlugins,
  type PluginVoteCounts,
} from "./votes";

export {
  BadPluginError,
  DuplicatePluginHashError,
  DuplicatePluginSemverError,
  ForbiddenPluginError,
  PluginNotFoundError,
  PluginServiceError,
} from "./errors";

export type PluginServiceOptions = {
  dbPath?: string;
  dataDir?: string;
};

export type PluginUploader = {
  id: string;
  username: string;
};

export type PluginVersionDetail = {
  id: string;
  versionId: string;
  semver: string;
  createdAt: string;
  downloadUrl: string;
  contentHash: string;
  originalPath: string;
  summary: Record<string, unknown>;
  notes?: string;
};

export type PluginDetail = PluginVoteCounts & {
  id: string;
  gameId: string;
  authorId: string;
  title: string;
  description: string | null;
  latestSemver: string;
  latestVersionId: string;
  createdAt: string;
  updatedAt: string;
  uploader: PluginUploader;
  downloadUrl: string;
  versionCount: number;
  versions: PluginVersionDetail[];
};

export type PluginListItem = PluginVoteCounts & {
  id: string;
  gameId: string;
  authorId: string;
  title: string;
  description: string | null;
  latestSemver: string;
  latestVersionId: string;
  versionCount: number;
  downloadUrl: string;
  uploader: PluginUploader;
};

export type ListPluginsOptions = PluginServiceOptions & {
  viewerUserId?: string | null;
  gameId?: string;
};

export type GetPluginOptions = PluginServiceOptions & {
  viewerUserId?: string | null;
};

export type CreatePluginInput = PluginServiceOptions & {
  authorId: string;
  gameId: string;
  title: string;
  description?: string;
  semver: string;
  notes?: string;
  fileBytes: Uint8Array;
};

export type AddPluginVersionInput = PluginServiceOptions & {
  pluginId: string;
  authorId: string;
  semver: string;
  fileBytes: Uint8Array;
  notes?: string;
};

export type PatchPluginInput = PluginServiceOptions & {
  id: string;
  authorId: string;
  title?: string;
  description?: string;
};

export type DeletePluginInput = PluginServiceOptions & {
  pluginId: string;
  authorId: string;
};

const EMPTY_SUMMARY_JSON = "{}";

function downloadUrl(pluginId: string, versionId: string): string {
  return `/api/plugins/${pluginId}/versions/${versionId}/download`;
}

function normalizeSemver(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new BadPluginError("Plugin semver is required");
  }
  try {
    return parseSemver(input);
  } catch {
    throw new BadPluginError(`Invalid semver: ${input}`);
  }
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new BadPluginError("Plugin title is required");
  }
  return trimmed;
}

function validateArchive(fileBytes: Uint8Array): void {
  try {
    assertNonEmptyZip(fileBytes);
  } catch (err) {
    throw new BadPluginError(
      err instanceof Error ? err.message : "Invalid plugin archive",
    );
  }
}

export function findPluginByHash(
  hash: string,
  options?: PluginServiceOptions,
): { pluginId: string; versionId: string; semver: string } | null {
  const normalized = hash.trim().toLowerCase();
  if (!normalized) return null;

  const db = getDb(options?.dbPath);
  const row = db
    .select({
      pluginId: pluginVersions.pluginId,
      versionId: pluginVersions.id,
      semver: pluginVersions.semver,
    })
    .from(pluginVersions)
    .where(eq(pluginVersions.contentHash, normalized))
    .get();

  if (!row) return null;
  return {
    pluginId: row.pluginId,
    versionId: row.versionId,
    semver: row.semver,
  };
}

function loadUploader(
  db: ReturnType<typeof getDb>,
  authorId: string,
): PluginUploader {
  const author = db
    .select({
      id: users.id,
      username: users.username,
    })
    .from(users)
    .where(eq(users.id, authorId))
    .get();

  return {
    id: authorId,
    username: author?.username ?? "",
  };
}

function mapVersionRow(
  pluginId: string,
  v: typeof pluginVersions.$inferSelect,
): PluginVersionDetail {
  return {
    id: v.id,
    versionId: v.id,
    semver: v.semver,
    createdAt: v.createdAt,
    downloadUrl: downloadUrl(pluginId, v.id),
    contentHash: v.contentHash,
    originalPath: v.originalPath,
    summary: JSON.parse(v.summaryJson) as Record<string, unknown>,
    ...(v.notes != null ? { notes: v.notes } : {}),
  };
}

export async function getPlugin(
  id: string,
  options?: GetPluginOptions,
): Promise<PluginDetail | null> {
  const db = getDb(options?.dbPath);
  const plugin = db.select().from(plugins).where(eq(plugins.id, id)).get();

  if (!plugin) return null;

  const versionRows = db
    .select()
    .from(pluginVersions)
    .where(eq(pluginVersions.pluginId, id))
    .all();
  versionRows.sort((a, b) => compareSemver(a.semver, b.semver));

  const versions = versionRows.map((v) => mapVersionRow(id, v));
  const votes = getPluginVoteCounts(id, options?.viewerUserId, options?.dbPath);

  return {
    id: plugin.id,
    gameId: plugin.gameId,
    authorId: plugin.authorId,
    title: plugin.title,
    description: plugin.description,
    latestSemver: plugin.latestSemver,
    latestVersionId: plugin.latestVersionId,
    createdAt: plugin.createdAt,
    updatedAt: plugin.updatedAt,
    uploader: loadUploader(db, plugin.authorId),
    downloadUrl: downloadUrl(plugin.id, plugin.latestVersionId),
    versionCount: versions.length || 1,
    ...votes,
    versions,
  };
}

export async function listPlugins(
  options?: ListPluginsOptions,
): Promise<PluginListItem[]> {
  const db = getDb(options?.dbPath);
  const rows = options?.gameId
    ? db
        .select()
        .from(plugins)
        .where(eq(plugins.gameId, options.gameId))
        .orderBy(desc(plugins.createdAt))
        .all()
    : db
        .select()
        .from(plugins)
        .orderBy(desc(plugins.createdAt))
        .all();

  if (rows.length === 0) return [];

  const allVersions = db.select().from(pluginVersions).all();
  const versionsByPlugin = new Map<string, (typeof allVersions)[number][]>();
  for (const v of allVersions) {
    const arr = versionsByPlugin.get(v.pluginId) ?? [];
    arr.push(v);
    versionsByPlugin.set(v.pluginId, arr);
  }

  const voteMap = getPluginVoteCountsForPlugins(
    rows.map((p) => p.id),
    options?.viewerUserId,
    options?.dbPath,
  );

  const out: PluginListItem[] = [];
  for (const plugin of rows) {
    const versions = versionsByPlugin.get(plugin.id) ?? [];
    const votes = voteMap.get(plugin.id) ?? {
      likes: 0,
      dislikes: 0,
      myVote: null,
    };

    out.push({
      id: plugin.id,
      gameId: plugin.gameId,
      authorId: plugin.authorId,
      title: plugin.title,
      description: plugin.description,
      latestSemver: plugin.latestSemver,
      latestVersionId: plugin.latestVersionId,
      versionCount: versions.length || 1,
      downloadUrl: downloadUrl(plugin.id, plugin.latestVersionId),
      uploader: loadUploader(db, plugin.authorId),
      ...votes,
    });
  }

  return out;
}

export async function createPlugin(
  input: CreatePluginInput,
): Promise<PluginDetail> {
  const {
    authorId,
    gameId,
    title,
    description,
    notes,
    fileBytes,
    dbPath,
    dataDir,
  } = input;
  const semver = normalizeSemver(input.semver);

  assertGameExists(gameId, { dbPath });

  const normalizedTitle = normalizeTitle(title);
  validateArchive(fileBytes);

  const contentHash = sha256Hex(fileBytes);
  const existingHash = findPluginByHash(contentHash, { dbPath });
  if (existingHash) {
    throw new DuplicatePluginHashError(
      existingHash.pluginId,
      existingHash.versionId,
      existingHash.semver,
    );
  }

  const pluginId = newId();
  const versionId = newId();
  const now = new Date().toISOString();
  const { originalPath } = pluginVersionPaths(dataDir, pluginId, versionId);

  const db = getDb(dbPath);
  const stagedPath = await stageUpload(getPluginsRoot(dataDir), fileBytes);
  let placed = false;

  try {
    db.transaction(
      (tx) => {
        tx.insert(plugins)
          .values({
            id: pluginId,
            gameId,
            authorId,
            title: normalizedTitle,
            description: description?.trim() || null,
            latestSemver: semver,
            latestVersionId: versionId,
            createdAt: now,
            updatedAt: now,
          })
          .run();

        tx.insert(pluginVersions)
          .values({
            id: versionId,
            pluginId,
            semver,
            notes: notes ?? null,
            contentHash,
            originalPath,
            summaryJson: EMPTY_SUMMARY_JSON,
            createdAt: now,
          })
          .run();

        placeStagedZip(stagedPath, originalPath, dataDir);
        placed = true;
      },
      { behavior: "immediate" },
    );
  } catch (err) {
    await discardStaged(stagedPath);
    if (placed) await removePlacedFile(originalPath, dataDir);
    if (isUniqueConstraintError(err)) {
      const dupHash = findPluginByHash(contentHash, { dbPath });
      if (dupHash) {
        throw new DuplicatePluginHashError(
          dupHash.pluginId,
          dupHash.versionId,
          dupHash.semver,
        );
      }
    }
    throw err;
  }

  const detail = await getPlugin(pluginId, { dbPath, dataDir });
  return detail!;
}

export async function addPluginVersion(
  input: AddPluginVersionInput,
): Promise<PluginDetail> {
  const { pluginId, authorId, fileBytes, notes, dbPath, dataDir } = input;
  const semver = normalizeSemver(input.semver);
  const db = getDb(dbPath);

  const plugin = db.select().from(plugins).where(eq(plugins.id, pluginId)).get();

  if (!plugin) {
    throw new PluginNotFoundError();
  }

  if (plugin.authorId !== authorId) {
    throw new ForbiddenPluginError();
  }

  validateArchive(fileBytes);

  const contentHash = sha256Hex(fileBytes);
  const existingHash = findPluginByHash(contentHash, { dbPath });
  if (existingHash) {
    throw new DuplicatePluginHashError(
      existingHash.pluginId,
      existingHash.versionId,
      existingHash.semver,
    );
  }

  const versionId = newId();
  const now = new Date().toISOString();

  const stagedPath = await stageUpload(getPluginsRoot(dataDir), fileBytes);
  let placedPath: string | null = null;

  try {
    db.transaction(
      (tx) => {
        // Re-read inside the write lock so concurrent uploads see a consistent version set.
        const current = tx
          .select()
          .from(plugins)
          .where(eq(plugins.id, pluginId))
          .get();
        if (!current) {
          throw new PluginNotFoundError();
        }
        if (current.authorId !== authorId) {
          throw new ForbiddenPluginError();
        }

        const existingRows = tx
          .select()
          .from(pluginVersions)
          .where(eq(pluginVersions.pluginId, pluginId))
          .all();
        const dupSemver = existingRows.find((r) => r.semver === semver);
        if (dupSemver) {
          throw new DuplicatePluginSemverError(
            pluginId,
            dupSemver.id,
            dupSemver.semver,
          );
        }

        const { originalPath } = pluginVersionPaths(
          dataDir,
          pluginId,
          versionId,
        );

        tx.insert(pluginVersions)
          .values({
            id: versionId,
            pluginId,
            semver,
            notes: notes ?? null,
            contentHash,
            originalPath,
            summaryJson: EMPTY_SUMMARY_JSON,
            createdAt: now,
          })
          .run();

        const latest = pickLatestBySemver([
          ...existingRows,
          { id: versionId, semver },
        ])!;

        tx.update(plugins)
          .set({
            latestSemver: latest.semver,
            latestVersionId: latest.id,
            updatedAt: now,
          })
          .where(eq(plugins.id, pluginId))
          .run();

        placeStagedZip(stagedPath, originalPath, dataDir);
        placedPath = originalPath;
      },
      { behavior: "immediate" },
    );
  } catch (err) {
    await discardStaged(stagedPath);
    if (placedPath) await removePlacedFile(placedPath, dataDir);
    if (isUniqueConstraintError(err)) {
      const dupHash = findPluginByHash(contentHash, { dbPath });
      if (dupHash) {
        throw new DuplicatePluginHashError(
          dupHash.pluginId,
          dupHash.versionId,
          dupHash.semver,
        );
      }
    }
    throw err;
  }

  const detail = await getPlugin(pluginId, { dbPath, dataDir });
  return detail!;
}

export async function patchPlugin(
  input: PatchPluginInput,
): Promise<PluginDetail> {
  const { id, authorId, title, description, dbPath, dataDir } = input;
  const db = getDb(dbPath);

  const plugin = db.select().from(plugins).where(eq(plugins.id, id)).get();

  if (!plugin) {
    throw new PluginNotFoundError();
  }

  if (plugin.authorId !== authorId) {
    throw new ForbiddenPluginError();
  }

  if (title === undefined && description === undefined) {
    throw new BadPluginError("Nothing to update");
  }

  const now = new Date().toISOString();
  const updates: {
    title?: string;
    description?: string | null;
    updatedAt: string;
  } = { updatedAt: now };

  if (title !== undefined) {
    updates.title = normalizeTitle(title);
  }
  if (description !== undefined) {
    updates.description = description.trim() || null;
  }

  db.update(plugins).set(updates).where(eq(plugins.id, id)).run();

  const detail = await getPlugin(id, { dbPath, dataDir });
  return detail!;
}

export async function deletePlugin(
  input: DeletePluginInput,
): Promise<{ ok: true; id: string }> {
  const { pluginId, authorId, dbPath, dataDir } = input;
  const db = getDb(dbPath);

  const plugin = db.select().from(plugins).where(eq(plugins.id, pluginId)).get();

  if (!plugin) {
    throw new PluginNotFoundError();
  }

  if (plugin.authorId !== authorId) {
    throw new ForbiddenPluginError();
  }

  db.transaction((tx) => {
    tx.delete(pluginVotes).where(eq(pluginVotes.pluginId, pluginId)).run();
    tx.delete(pluginVersions)
      .where(eq(pluginVersions.pluginId, pluginId))
      .run();
    tx.delete(plugins).where(eq(plugins.id, pluginId)).run();
  });

  await removePluginFiles(pluginId, dataDir);

  return { ok: true, id: pluginId };
}

export async function getPluginVersionBytes(
  pluginId: string,
  versionId: string,
  options?: PluginServiceOptions,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const db = getDb(options?.dbPath);
  const row = db
    .select()
    .from(pluginVersions)
    .where(
      and(
        eq(pluginVersions.pluginId, pluginId),
        eq(pluginVersions.id, versionId),
      ),
    )
    .get();

  if (!row) return null;

  const file = Bun.file(row.originalPath);
  if (!(await file.exists())) return null;

  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    contentType: "application/zip",
  };
}
