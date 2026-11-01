import { and, asc, desc, eq } from "drizzle-orm";
import { sha256Hex } from "../cards/hash";
import { assertNonEmptyZip } from "../common/zip";
import {
  discardStaged,
  isUniqueConstraintError,
  stageUpload,
} from "../common/staging";
import { getDb } from "../db/client";
import { softmodVersions, softmodVotes, softmods, users } from "../db/schema";
import {
  BadSoftmodError,
  DuplicateSoftmodHashError,
  ForbiddenSoftmodError,
  SoftmodGuidConflictError,
  SoftmodNotFoundError,
} from "./errors";
import { parseSoftmodManifest } from "./manifest";
import {
  assertSafeSoftmodId,
  getSoftmodsRoot,
  placeStagedZipmod,
  removePlacedFile,
  removeSoftmodFiles,
  softmodVersionPaths,
} from "./storage";
import { assertGameExists } from "../games/service";
import {
  getSoftmodVoteCounts,
  getSoftmodVoteCountsForSoftmods,
  type SoftmodVoteCounts,
} from "./votes";

export {
  BadSoftmodError,
  DuplicateSoftmodHashError,
  ForbiddenSoftmodError,
  SoftmodGuidConflictError,
  SoftmodNotFoundError,
  SoftmodServiceError,
} from "./errors";

export type SoftmodServiceOptions = {
  dbPath?: string;
  dataDir?: string;
};

export type SoftmodUploader = {
  id: string;
  username: string;
};

export type SoftmodVersionDetail = {
  version: number;
  packageVersion: string;
  createdAt: string;
  downloadUrl: string;
  contentHash: string;
  originalPath: string;
  summary: Record<string, unknown>;
  notes?: string;
};

export type SoftmodDetail = SoftmodVoteCounts & {
  id: string;
  gameId: string;
  authorId: string;
  title: string;
  modAuthor: string | null;
  description: string;
  website: string | null;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
  uploader: SoftmodUploader;
  downloadUrl: string;
  versionCount: number;
  versions: SoftmodVersionDetail[];
};

export type SoftmodListItem = SoftmodVoteCounts & {
  id: string;
  gameId: string;
  authorId: string;
  title: string;
  modAuthor: string | null;
  description: string;
  latestVersion: number;
  versionCount: number;
  downloadUrl: string;
  uploader: SoftmodUploader;
  packageVersion: string;
};

export type ListSoftmodsOptions = SoftmodServiceOptions & {
  viewerUserId?: string | null;
  gameId?: string;
};

export type GetSoftmodOptions = SoftmodServiceOptions & {
  viewerUserId?: string | null;
};

export type CreateSoftmodInput = SoftmodServiceOptions & {
  authorId: string;
  gameId: string;
  fileBytes: Uint8Array;
  notes?: string;
};

export type AddSoftmodVersionInput = SoftmodServiceOptions & {
  softmodId: string;
  authorId: string;
  fileBytes: Uint8Array;
  notes?: string;
};

export type DeleteSoftmodInput = SoftmodServiceOptions & {
  softmodId: string;
  authorId: string;
};

function downloadUrl(softmodId: string, version: number): string {
  return `/api/softmods/${softmodId}/versions/${version}/download`;
}

function validateArchive(fileBytes: Uint8Array): void {
  try {
    assertNonEmptyZip(fileBytes);
  } catch (err) {
    throw new BadSoftmodError(
      err instanceof Error ? err.message : "Invalid softmod archive",
    );
  }
}

function parseManifest(fileBytes: Uint8Array) {
  try {
    return parseSoftmodManifest(fileBytes);
  } catch (err) {
    throw new BadSoftmodError(
      err instanceof Error ? err.message : "Invalid softmod archive",
    );
  }
}

export function findSoftmodByHash(
  hash: string,
  options?: SoftmodServiceOptions,
): { softmodId: string; version: number } | null {
  const normalized = hash.trim().toLowerCase();
  if (!normalized) return null;

  const db = getDb(options?.dbPath);
  const row = db
    .select({
      softmodId: softmodVersions.softmodId,
      version: softmodVersions.version,
    })
    .from(softmodVersions)
    .where(eq(softmodVersions.contentHash, normalized))
    .get();

  if (!row) return null;
  return {
    softmodId: row.softmodId,
    version: row.version,
  };
}

function loadUploader(
  db: ReturnType<typeof getDb>,
  authorId: string,
): SoftmodUploader {
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
  softmodId: string,
  v: typeof softmodVersions.$inferSelect,
): SoftmodVersionDetail {
  return {
    version: v.version,
    packageVersion: v.packageVersion,
    createdAt: v.createdAt,
    downloadUrl: downloadUrl(softmodId, v.version),
    contentHash: v.contentHash,
    originalPath: v.originalPath,
    summary: JSON.parse(v.summaryJson) as Record<string, unknown>,
    ...(v.notes != null ? { notes: v.notes } : {}),
  };
}

export async function getSoftmod(
  id: string,
  options?: GetSoftmodOptions,
): Promise<SoftmodDetail | null> {
  const db = getDb(options?.dbPath);
  const softmod = db
    .select()
    .from(softmods)
    .where(eq(softmods.id, id))
    .get();

  if (!softmod) return null;

  const versionRows = db
    .select()
    .from(softmodVersions)
    .where(eq(softmodVersions.softmodId, id))
    .orderBy(asc(softmodVersions.version))
    .all();

  const versions = versionRows.map((v) => mapVersionRow(id, v));
  const votes = getSoftmodVoteCounts(id, options?.viewerUserId, options?.dbPath);

  return {
    id: softmod.id,
    gameId: softmod.gameId,
    authorId: softmod.authorId,
    title: softmod.title,
    modAuthor: softmod.modAuthor,
    description: softmod.description,
    website: softmod.website,
    latestVersion: softmod.latestVersion,
    createdAt: softmod.createdAt,
    updatedAt: softmod.updatedAt,
    uploader: loadUploader(db, softmod.authorId),
    downloadUrl: downloadUrl(softmod.id, softmod.latestVersion),
    versionCount: versions.length || 1,
    ...votes,
    versions,
  };
}

export async function listSoftmods(
  options?: ListSoftmodsOptions,
): Promise<SoftmodListItem[]> {
  const db = getDb(options?.dbPath);
  const rows = options?.gameId
    ? db
        .select()
        .from(softmods)
        .where(eq(softmods.gameId, options.gameId))
        .orderBy(desc(softmods.createdAt))
        .all()
    : db
        .select()
        .from(softmods)
        .orderBy(desc(softmods.createdAt))
        .all();

  if (rows.length === 0) return [];

  const allVersions = db.select().from(softmodVersions).all();
  const versionsBySoftmod = new Map<string, (typeof allVersions)[number][]>();
  for (const v of allVersions) {
    const arr = versionsBySoftmod.get(v.softmodId) ?? [];
    arr.push(v);
    versionsBySoftmod.set(v.softmodId, arr);
  }

  const voteMap = getSoftmodVoteCountsForSoftmods(
    rows.map((s) => s.id),
    options?.viewerUserId,
    options?.dbPath,
  );

  const out: SoftmodListItem[] = [];
  for (const softmod of rows) {
    const versions = versionsBySoftmod.get(softmod.id) ?? [];
    const latestRow =
      versions.find((v) => v.version === softmod.latestVersion) ??
      versions.reduce<(typeof versions)[number] | undefined>(
        (best, cur) => (!best || cur.version > best.version ? cur : best),
        undefined,
      );

    const votes = voteMap.get(softmod.id) ?? {
      likes: 0,
      dislikes: 0,
      myVote: null,
    };

    out.push({
      id: softmod.id,
      gameId: softmod.gameId,
      authorId: softmod.authorId,
      title: softmod.title,
      modAuthor: softmod.modAuthor,
      description: softmod.description,
      latestVersion: softmod.latestVersion,
      versionCount: versions.length || 1,
      downloadUrl: downloadUrl(softmod.id, softmod.latestVersion),
      uploader: loadUploader(db, softmod.authorId),
      packageVersion: latestRow?.packageVersion ?? "",
      ...votes,
    });
  }

  return out;
}

export async function createSoftmod(
  input: CreateSoftmodInput,
): Promise<SoftmodDetail> {
  const { authorId, gameId, fileBytes, notes, dbPath, dataDir } = input;

  assertGameExists(gameId, { dbPath });

  validateArchive(fileBytes);

  const contentHash = sha256Hex(fileBytes);
  const existingHash = findSoftmodByHash(contentHash, { dbPath });
  if (existingHash) {
    throw new DuplicateSoftmodHashError(
      existingHash.softmodId,
      existingHash.version,
    );
  }

  const manifest = parseManifest(fileBytes);
  const softmodId = manifest.guid;
  assertSafeSoftmodId(softmodId);

  const db = getDb(dbPath);
  const existingGuid = db
    .select({ id: softmods.id })
    .from(softmods)
    .where(eq(softmods.id, softmodId))
    .get();

  if (existingGuid) {
    throw new SoftmodGuidConflictError(softmodId);
  }

  const version = 1;
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { originalPath } = softmodVersionPaths(dataDir, softmodId, version);
  const summaryJson = JSON.stringify(manifest.raw);

  // Stage bytes first; the final path is only written inside the DB
  // transaction, so a losing concurrent upload never overwrites live files.
  const stagedPath = await stageUpload(getSoftmodsRoot(dataDir), fileBytes);
  let placed = false;

  try {
    db.transaction(
      (tx) => {
        tx.insert(softmods)
          .values({
            id: softmodId,
            gameId,
            authorId,
            title: manifest.name || "Untitled",
            modAuthor: manifest.author || null,
            description: manifest.description,
            website: manifest.website,
            latestVersion: version,
            createdAt: now,
            updatedAt: now,
          })
          .run();

        tx.insert(softmodVersions)
          .values({
            id: versionId,
            softmodId,
            version,
            packageVersion: manifest.version,
            notes: notes ?? null,
            contentHash,
            originalPath,
            summaryJson,
            createdAt: now,
          })
          .run();

        placeStagedZipmod(stagedPath, originalPath, dataDir);
        placed = true;
      },
      { behavior: "immediate" },
    );
  } catch (err) {
    await discardStaged(stagedPath);
    if (placed) await removePlacedFile(originalPath, dataDir);
    if (isUniqueConstraintError(err)) {
      const dupHash = findSoftmodByHash(contentHash, { dbPath });
      if (dupHash) {
        throw new DuplicateSoftmodHashError(dupHash.softmodId, dupHash.version);
      }
      const dupGuid = db
        .select({ id: softmods.id })
        .from(softmods)
        .where(eq(softmods.id, softmodId))
        .get();
      if (dupGuid) {
        throw new SoftmodGuidConflictError(softmodId);
      }
    }
    throw err;
  }

  const detail = await getSoftmod(softmodId, { dbPath, dataDir });
  return detail!;
}

export async function addSoftmodVersion(
  input: AddSoftmodVersionInput,
): Promise<SoftmodDetail> {
  const { softmodId, authorId, fileBytes, notes, dbPath, dataDir } = input;
  const db = getDb(dbPath);

  const softmod = db
    .select()
    .from(softmods)
    .where(eq(softmods.id, softmodId))
    .get();

  if (!softmod) {
    throw new SoftmodNotFoundError();
  }

  if (softmod.authorId !== authorId) {
    throw new ForbiddenSoftmodError();
  }

  validateArchive(fileBytes);

  const contentHash = sha256Hex(fileBytes);
  const existingHash = findSoftmodByHash(contentHash, { dbPath });
  if (existingHash) {
    throw new DuplicateSoftmodHashError(
      existingHash.softmodId,
      existingHash.version,
    );
  }

  const manifest = parseManifest(fileBytes);
  if (manifest.guid !== softmodId) {
    throw new BadSoftmodError(
      `Manifest guid ${manifest.guid} does not match softmod id ${softmodId}`,
    );
  }
  assertSafeSoftmodId(softmodId);

  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const summaryJson = JSON.stringify(manifest.raw);

  const stagedPath = await stageUpload(getSoftmodsRoot(dataDir), fileBytes);
  let placedPath: string | null = null;

  try {
    db.transaction(
      (tx) => {
        // Re-read inside the write lock so concurrent uploads get distinct versions.
        const current = tx
          .select()
          .from(softmods)
          .where(eq(softmods.id, softmodId))
          .get();
        if (!current) {
          throw new SoftmodNotFoundError();
        }
        if (current.authorId !== authorId) {
          throw new ForbiddenSoftmodError();
        }

        const nextVersion = current.latestVersion + 1;
        const { originalPath } = softmodVersionPaths(
          dataDir,
          softmodId,
          nextVersion,
        );

        tx.insert(softmodVersions)
          .values({
            id: versionId,
            softmodId,
            version: nextVersion,
            packageVersion: manifest.version,
            notes: notes ?? null,
            contentHash,
            originalPath,
            summaryJson,
            createdAt: now,
          })
          .run();

        tx.update(softmods)
          .set({
            title: manifest.name || current.title,
            modAuthor: manifest.author || null,
            description: manifest.description,
            website: manifest.website,
            latestVersion: nextVersion,
            updatedAt: now,
          })
          .where(eq(softmods.id, softmodId))
          .run();

        placeStagedZipmod(stagedPath, originalPath, dataDir);
        placedPath = originalPath;
      },
      { behavior: "immediate" },
    );
  } catch (err) {
    await discardStaged(stagedPath);
    if (placedPath) await removePlacedFile(placedPath, dataDir);
    if (isUniqueConstraintError(err)) {
      const dupHash = findSoftmodByHash(contentHash, { dbPath });
      if (dupHash) {
        throw new DuplicateSoftmodHashError(dupHash.softmodId, dupHash.version);
      }
    }
    throw err;
  }

  const detail = await getSoftmod(softmodId, { dbPath, dataDir });
  return detail!;
}

export async function deleteSoftmod(
  input: DeleteSoftmodInput,
): Promise<{ ok: true; id: string }> {
  const { softmodId, authorId, dbPath, dataDir } = input;
  const db = getDb(dbPath);

  const softmod = db
    .select()
    .from(softmods)
    .where(eq(softmods.id, softmodId))
    .get();

  if (!softmod) {
    throw new SoftmodNotFoundError();
  }

  if (softmod.authorId !== authorId) {
    throw new ForbiddenSoftmodError();
  }

  db.transaction((tx) => {
    tx.delete(softmodVotes).where(eq(softmodVotes.softmodId, softmodId)).run();
    tx.delete(softmodVersions)
      .where(eq(softmodVersions.softmodId, softmodId))
      .run();
    tx.delete(softmods).where(eq(softmods.id, softmodId)).run();
  });

  await removeSoftmodFiles(softmodId, dataDir);

  return { ok: true, id: softmodId };
}

export async function getSoftmodVersionBytes(
  softmodId: string,
  version: number,
  options?: SoftmodServiceOptions,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const db = getDb(options?.dbPath);
  const row = db
    .select()
    .from(softmodVersions)
    .where(
      and(
        eq(softmodVersions.softmodId, softmodId),
        eq(softmodVersions.version, version),
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
