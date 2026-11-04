import { compareSemver, parseSemver, pickLatestBySemver } from "@echbox/shared";
import { and, count, eq, inArray } from "drizzle-orm";
import { sha256Hex } from "../cards/hash";
import {
  orderBySort,
  resolveListWindow,
  titleSlugSearch,
  voteNetScore,
  type CatalogListQuery,
  type PaginatedList,
} from "../common/list-query";
import { assertNonEmptyZip } from "../common/zip";
import {
  discardStaged,
  isUniqueConstraintError,
  stageUpload,
} from "../common/staging";
import { getDb } from "../db/client";
import { newId } from "../id";
import { softmodVersions, softmodVotes, softmods, users } from "../db/schema";
import {
  BadSoftmodError,
  DuplicateSoftmodHashError,
  DuplicateSoftmodSemverError,
  ForbiddenSoftmodError,
  SoftmodGuidConflictError,
  SoftmodNotFoundError,
} from "./errors";
import { parseSoftmodManifest } from "./manifest";
import {
  loadContentOriginal,
  storeContentOriginal,
  type ContentBlobOptions,
} from "../proxy/content-blob-service";
import {
  assertSafeSoftmodId,
  getSoftmodsRoot,
  removeSoftmodFiles,
  removeSoftmodVersionFiles,
} from "./storage";
import { assertGameSupportsKind } from "../games/service";
import {
  getSoftmodVoteCounts,
  getSoftmodVoteCountsForSoftmods,
  type SoftmodVoteCounts,
} from "./votes";

export {
  BadSoftmodError,
  DuplicateSoftmodHashError,
  DuplicateSoftmodSemverError,
  ForbiddenSoftmodError,
  SoftmodGuidConflictError,
  SoftmodNotFoundError,
  SoftmodServiceError,
} from "./errors";

export type SoftmodServiceOptions = ContentBlobOptions;

export type SoftmodUploader = {
  id: string;
  username: string;
};

export type SoftmodVersionDetail = {
  id: string;
  versionId: string;
  semver: string;
  createdAt: string;
  downloadUrl: string;
  contentHash: string;
  originalPath: string | null;
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
  latestSemver: string | null;
  latestVersionId: string | null;
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
  latestSemver: string | null;
  latestVersionId: string | null;
  versionCount: number;
  downloadUrl: string;
  uploader: SoftmodUploader;
};

export type ListSoftmodsOptions = SoftmodServiceOptions &
  CatalogListQuery & {
    viewerUserId?: string | null;
    gameId?: string;
    authorId?: string;
  };

export type GetSoftmodOptions = SoftmodServiceOptions & {
  viewerUserId?: string | null;
};

export type CreateSoftmodInput = SoftmodServiceOptions & {
  authorId: string;
  gameId: string;
  semver: string;
  fileBytes: Uint8Array;
  notes?: string;
};

export type AddSoftmodVersionInput = SoftmodServiceOptions & {
  softmodId: string;
  authorId: string;
  semver: string;
  fileBytes: Uint8Array;
  notes?: string;
};

export type DeleteSoftmodInput = SoftmodServiceOptions & {
  softmodId: string;
  authorId: string;
};

export type DeleteSoftmodVersionInput = SoftmodServiceOptions & {
  softmodId: string;
  versionId: string;
  authorId: string;
};

function downloadUrl(softmodId: string, versionId: string | null): string {
  if (!versionId) return "";
  return `/api/softmods/${softmodId}/versions/${versionId}/download`;
}

function normalizeSemver(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new BadSoftmodError("Version is required (for example 1.0.0).");
  }
  try {
    return parseSemver(input);
  } catch {
    throw new BadSoftmodError(
      "Enter a valid version number (for example 1.0.0).",
    );
  }
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
): { softmodId: string; versionId: string; semver: string } | null {
  const normalized = hash.trim().toLowerCase();
  if (!normalized) return null;

  const db = getDb(options?.dbPath);
  const row = db
    .select({
      softmodId: softmodVersions.softmodId,
      versionId: softmodVersions.id,
      semver: softmodVersions.semver,
    })
    .from(softmodVersions)
    .where(eq(softmodVersions.contentHash, normalized))
    .get();

  if (!row) return null;
  return {
    softmodId: row.softmodId,
    versionId: row.versionId,
    semver: row.semver,
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
    id: v.id,
    versionId: v.id,
    semver: v.semver,
    createdAt: v.createdAt,
    downloadUrl: downloadUrl(softmodId, v.id),
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
    .all();
  versionRows.sort((a, b) => compareSemver(a.semver, b.semver));

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
    latestSemver: softmod.latestSemver,
    latestVersionId: softmod.latestVersionId,
    createdAt: softmod.createdAt,
    updatedAt: softmod.updatedAt,
    uploader: loadUploader(db, softmod.authorId),
    downloadUrl: downloadUrl(softmod.id, softmod.latestVersionId),
    versionCount: versions.length,
    ...votes,
    versions,
  };
}

export async function listSoftmods(
  options?: ListSoftmodsOptions,
): Promise<PaginatedList<SoftmodListItem>> {
  const db = getDb(options?.dbPath);
  const { page, limit, offset, sort, q, unbounded } = resolveListWindow(options);

  const whereClause = and(
    options?.gameId ? eq(softmods.gameId, options.gameId) : undefined,
    options?.authorId ? eq(softmods.authorId, options.authorId) : undefined,
    titleSlugSearch(softmods.title, null, q),
  );
  const score = voteNetScore("softmod_votes", "softmod_id", softmods.id);
  const order = orderBySort(sort, softmods.createdAt, softmods.title, score);

  const total =
    db
      .select({ value: count() })
      .from(softmods)
      .where(whereClause)
      .get()?.value ?? 0;

  if (total === 0) {
    return { items: [], total: 0, page, limit: unbounded ? 0 : limit };
  }

  const rows = unbounded
    ? db
        .select()
        .from(softmods)
        .where(whereClause)
        .orderBy(...order)
        .all()
    : db
        .select()
        .from(softmods)
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
          .from(softmodVersions)
          .where(inArray(softmodVersions.softmodId, ids))
          .all();
  const versionsBySoftmod = new Map<string, (typeof pageVersions)[number][]>();
  for (const v of pageVersions) {
    const arr = versionsBySoftmod.get(v.softmodId) ?? [];
    arr.push(v);
    versionsBySoftmod.set(v.softmodId, arr);
  }

  const voteMap = getSoftmodVoteCountsForSoftmods(
    ids,
    options?.viewerUserId,
    options?.dbPath,
  );

  const items: SoftmodListItem[] = [];
  for (const softmod of rows) {
    const versions = versionsBySoftmod.get(softmod.id) ?? [];
    const votes = voteMap.get(softmod.id) ?? {
      likes: 0,
      dislikes: 0,
      myVote: null,
    };

    items.push({
      id: softmod.id,
      gameId: softmod.gameId,
      authorId: softmod.authorId,
      title: softmod.title,
      modAuthor: softmod.modAuthor,
      description: softmod.description,
      latestSemver: softmod.latestSemver,
      latestVersionId: softmod.latestVersionId,
      versionCount: versions.length,
      downloadUrl: downloadUrl(softmod.id, softmod.latestVersionId),
      uploader: loadUploader(db, softmod.authorId),
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

export async function createSoftmod(
  input: CreateSoftmodInput,
): Promise<SoftmodDetail> {
  const { authorId, gameId, fileBytes, notes, dbPath, dataDir } = input;
  const semver = normalizeSemver(input.semver);

  assertGameSupportsKind(gameId, "softmods", { dbPath });

  validateArchive(fileBytes);

  const contentHash = sha256Hex(fileBytes);
  const existingHash = findSoftmodByHash(contentHash, { dbPath });
  if (existingHash) {
    throw new DuplicateSoftmodHashError(
      existingHash.softmodId,
      existingHash.versionId,
      existingHash.semver,
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

  const versionId = newId();
  const now = new Date().toISOString();
  const summaryJson = JSON.stringify(manifest.raw);

  const stagedPath = await stageUpload(getSoftmodsRoot(dataDir), fileBytes);
  const blobOptions: ContentBlobOptions = {
    dbPath,
    dataDir,
    transport: input.transport,
    telegramChatId: input.telegramChatId,
  };

  try {
    await storeContentOriginal(contentHash, fileBytes, blobOptions);

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
            latestSemver: semver,
            latestVersionId: versionId,
            createdAt: now,
            updatedAt: now,
          })
          .run();

        tx.insert(softmodVersions)
          .values({
            id: versionId,
            softmodId,
            semver,
            notes: notes ?? null,
            contentHash,
            originalPath: null,
            summaryJson,
            createdAt: now,
          })
          .run();
      },
      { behavior: "immediate" },
    );
  } catch (err) {
    await discardStaged(stagedPath);
    if (isUniqueConstraintError(err)) {
      const dupHash = findSoftmodByHash(contentHash, { dbPath });
      if (dupHash) {
        throw new DuplicateSoftmodHashError(
          dupHash.softmodId,
          dupHash.versionId,
          dupHash.semver,
        );
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

  await discardStaged(stagedPath);

  const detail = await getSoftmod(softmodId, { dbPath, dataDir });
  return detail!;
}

export async function addSoftmodVersion(
  input: AddSoftmodVersionInput,
): Promise<SoftmodDetail> {
  const { softmodId, authorId, fileBytes, notes, dbPath, dataDir } = input;
  const semver = normalizeSemver(input.semver);
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
      existingHash.versionId,
      existingHash.semver,
    );
  }

  const manifest = parseManifest(fileBytes);
  if (manifest.guid !== softmodId) {
    throw new BadSoftmodError(
      `Manifest guid ${manifest.guid} does not match softmod id ${softmodId}`,
    );
  }
  assertSafeSoftmodId(softmodId);

  const versionId = newId();
  const now = new Date().toISOString();
  const summaryJson = JSON.stringify(manifest.raw);

  const stagedPath = await stageUpload(getSoftmodsRoot(dataDir), fileBytes);
  const blobOptions: ContentBlobOptions = {
    dbPath,
    dataDir,
    transport: input.transport,
    telegramChatId: input.telegramChatId,
  };

  try {
    await storeContentOriginal(contentHash, fileBytes, blobOptions);

    db.transaction(
      (tx) => {
        // Re-read inside the write lock so concurrent uploads see a consistent version set.
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

        const existingRows = tx
          .select()
          .from(softmodVersions)
          .where(eq(softmodVersions.softmodId, softmodId))
          .all();
        const dupSemver = existingRows.find((r) => r.semver === semver);
        if (dupSemver) {
          throw new DuplicateSoftmodSemverError(
            softmodId,
            dupSemver.id,
            dupSemver.semver,
          );
        }

        tx.insert(softmodVersions)
          .values({
            id: versionId,
            softmodId,
            semver,
            notes: notes ?? null,
            contentHash,
            originalPath: null,
            summaryJson,
            createdAt: now,
          })
          .run();

        const latest = pickLatestBySemver([
          ...existingRows,
          { id: versionId, semver },
        ])!;

        tx.update(softmods)
          .set({
            title: manifest.name || current.title,
            modAuthor: manifest.author || null,
            description: manifest.description,
            website: manifest.website,
            latestSemver: latest.semver,
            latestVersionId: latest.id,
            updatedAt: now,
          })
          .where(eq(softmods.id, softmodId))
          .run();
      },
      { behavior: "immediate" },
    );
  } catch (err) {
    await discardStaged(stagedPath);
    if (isUniqueConstraintError(err)) {
      const dupHash = findSoftmodByHash(contentHash, { dbPath });
      if (dupHash) {
        throw new DuplicateSoftmodHashError(
          dupHash.softmodId,
          dupHash.versionId,
          dupHash.semver,
        );
      }
    }
    throw err;
  }

  await discardStaged(stagedPath);

  const detail = await getSoftmod(softmodId, { dbPath, dataDir });
  return detail!;
}

export async function deleteSoftmodVersion(
  input: DeleteSoftmodVersionInput,
): Promise<SoftmodDetail> {
  const { softmodId, versionId, authorId, dbPath, dataDir } = input;
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

  const version = db
    .select()
    .from(softmodVersions)
    .where(
      and(
        eq(softmodVersions.softmodId, softmodId),
        eq(softmodVersions.id, versionId),
      ),
    )
    .get();

  if (!version) {
    throw new SoftmodNotFoundError("Version not found");
  }

  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.delete(softmodVersions).where(eq(softmodVersions.id, versionId)).run();

    const remaining = tx
      .select({ id: softmodVersions.id, semver: softmodVersions.semver })
      .from(softmodVersions)
      .where(eq(softmodVersions.softmodId, softmodId))
      .all();

    const latest = pickLatestBySemver(remaining);

    tx.update(softmods)
      .set({
        latestSemver: latest?.semver ?? null,
        latestVersionId: latest?.id ?? null,
        updatedAt: now,
      })
      .where(eq(softmods.id, softmodId))
      .run();
  });

  await removeSoftmodVersionFiles(softmodId, versionId, dataDir);

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
  versionId: string,
  options?: SoftmodServiceOptions,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const db = getDb(options?.dbPath);
  const row = db
    .select()
    .from(softmodVersions)
    .where(
      and(
        eq(softmodVersions.softmodId, softmodId),
        eq(softmodVersions.id, versionId),
      ),
    )
    .get();

  if (!row) return null;

  const bytes = await loadContentOriginal(row.contentHash, row.originalPath, {
    dbPath: options?.dbPath,
    dataDir: options?.dataDir,
    transport: options?.transport,
    telegramChatId: options?.telegramChatId,
  });
  if (!bytes) return null;

  return {
    bytes,
    contentType: "application/zip",
  };
}
