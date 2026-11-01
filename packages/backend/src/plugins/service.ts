import { and, asc, desc, eq } from "drizzle-orm";
import { sha256Hex } from "../cards/hash";
import { getDb } from "../db/client";
import { pluginVersions, pluginVotes, plugins, users } from "../db/schema";
import {
  BadPluginError,
  DuplicatePluginHashError,
  ForbiddenPluginError,
  PluginNotFoundError,
} from "./errors";
import {
  pluginVersionPaths,
  removePluginFiles,
  writeOriginalZip,
} from "./storage";
import {
  getPluginVoteCounts,
  getPluginVoteCountsForPlugins,
  type PluginVoteCounts,
} from "./votes";

export {
  BadPluginError,
  DuplicatePluginHashError,
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
  version: number;
  createdAt: string;
  downloadUrl: string;
  contentHash: string;
  originalPath: string;
  summary: Record<string, unknown>;
  notes?: string;
};

export type PluginDetail = PluginVoteCounts & {
  id: string;
  authorId: string;
  title: string;
  description: string | null;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
  uploader: PluginUploader;
  downloadUrl: string;
  versionCount: number;
  versions: PluginVersionDetail[];
};

export type PluginListItem = PluginVoteCounts & {
  id: string;
  authorId: string;
  title: string;
  description: string | null;
  latestVersion: number;
  versionCount: number;
  downloadUrl: string;
  uploader: PluginUploader;
};

export type ListPluginsOptions = PluginServiceOptions & {
  viewerUserId?: string | null;
};

export type GetPluginOptions = PluginServiceOptions & {
  viewerUserId?: string | null;
};

export type CreatePluginInput = PluginServiceOptions & {
  authorId: string;
  title: string;
  description?: string;
  notes?: string;
  fileBytes: Uint8Array;
};

export type AddPluginVersionInput = PluginServiceOptions & {
  pluginId: string;
  authorId: string;
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

function downloadUrl(pluginId: string, version: number): string {
  return `/api/plugins/${pluginId}/versions/${version}/download`;
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new BadPluginError("Plugin title is required");
  }
  return trimmed;
}

export function findPluginByHash(
  hash: string,
  options?: PluginServiceOptions,
): { pluginId: string; version: number } | null {
  const normalized = hash.trim().toLowerCase();
  if (!normalized) return null;

  const db = getDb(options?.dbPath);
  const row = db
    .select({
      pluginId: pluginVersions.pluginId,
      version: pluginVersions.version,
    })
    .from(pluginVersions)
    .where(eq(pluginVersions.contentHash, normalized))
    .get();

  if (!row) return null;
  return {
    pluginId: row.pluginId,
    version: row.version,
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
    version: v.version,
    createdAt: v.createdAt,
    downloadUrl: downloadUrl(pluginId, v.version),
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
    .orderBy(asc(pluginVersions.version))
    .all();

  const versions = versionRows.map((v) => mapVersionRow(id, v));
  const votes = getPluginVoteCounts(id, options?.viewerUserId, options?.dbPath);

  return {
    id: plugin.id,
    authorId: plugin.authorId,
    title: plugin.title,
    description: plugin.description,
    latestVersion: plugin.latestVersion,
    createdAt: plugin.createdAt,
    updatedAt: plugin.updatedAt,
    uploader: loadUploader(db, plugin.authorId),
    downloadUrl: downloadUrl(plugin.id, plugin.latestVersion),
    versionCount: versions.length || 1,
    ...votes,
    versions,
  };
}

export async function listPlugins(
  options?: ListPluginsOptions,
): Promise<PluginListItem[]> {
  const db = getDb(options?.dbPath);
  const rows = db
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
      authorId: plugin.authorId,
      title: plugin.title,
      description: plugin.description,
      latestVersion: plugin.latestVersion,
      versionCount: versions.length || 1,
      downloadUrl: downloadUrl(plugin.id, plugin.latestVersion),
      uploader: loadUploader(db, plugin.authorId),
      ...votes,
    });
  }

  return out;
}

export async function createPlugin(
  input: CreatePluginInput,
): Promise<PluginDetail> {
  const { authorId, title, description, notes, fileBytes, dbPath, dataDir } =
    input;

  const contentHash = sha256Hex(fileBytes);
  const existingHash = findPluginByHash(contentHash, { dbPath });
  if (existingHash) {
    throw new DuplicatePluginHashError(
      existingHash.pluginId,
      existingHash.version,
    );
  }

  const pluginId = crypto.randomUUID();
  const normalizedTitle = normalizeTitle(title);
  const version = 1;
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { originalPath } = pluginVersionPaths(dataDir, pluginId, version);

  await writeOriginalZip(fileBytes, originalPath);

  const db = getDb(dbPath);

  db.transaction((tx) => {
    tx.insert(plugins)
      .values({
        id: pluginId,
        authorId,
        title: normalizedTitle,
        description: description?.trim() || null,
        latestVersion: version,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    tx.insert(pluginVersions)
      .values({
        id: versionId,
        pluginId,
        version,
        notes: notes ?? null,
        contentHash,
        originalPath,
        summaryJson: EMPTY_SUMMARY_JSON,
        createdAt: now,
      })
      .run();
  });

  const detail = await getPlugin(pluginId, { dbPath, dataDir });
  return detail!;
}

export async function addPluginVersion(
  input: AddPluginVersionInput,
): Promise<PluginDetail> {
  const { pluginId, authorId, fileBytes, notes, dbPath, dataDir } = input;
  const db = getDb(dbPath);

  const plugin = db.select().from(plugins).where(eq(plugins.id, pluginId)).get();

  if (!plugin) {
    throw new PluginNotFoundError();
  }

  if (plugin.authorId !== authorId) {
    throw new ForbiddenPluginError();
  }

  const contentHash = sha256Hex(fileBytes);
  const existingHash = findPluginByHash(contentHash, { dbPath });
  if (existingHash) {
    throw new DuplicatePluginHashError(
      existingHash.pluginId,
      existingHash.version,
    );
  }

  const nextVersion = plugin.latestVersion + 1;
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { originalPath } = pluginVersionPaths(dataDir, pluginId, nextVersion);

  await writeOriginalZip(fileBytes, originalPath);

  db.transaction((tx) => {
    tx.insert(pluginVersions)
      .values({
        id: versionId,
        pluginId,
        version: nextVersion,
        notes: notes ?? null,
        contentHash,
        originalPath,
        summaryJson: EMPTY_SUMMARY_JSON,
        createdAt: now,
      })
      .run();

    tx.update(plugins)
      .set({
        latestVersion: nextVersion,
        updatedAt: now,
      })
      .where(eq(plugins.id, pluginId))
      .run();
  });

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
  version: number,
  options?: PluginServiceOptions,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const db = getDb(options?.dbPath);
  const row = db
    .select()
    .from(pluginVersions)
    .where(
      and(
        eq(pluginVersions.pluginId, pluginId),
        eq(pluginVersions.version, version),
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
