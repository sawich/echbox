import { and, asc, desc, eq } from "drizzle-orm";
import { sha256Hex } from "../cards/hash";
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
  removeSoftmodFiles,
  softmodVersionPaths,
  writeOriginalZipmod,
} from "./storage";
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
};

export type GetSoftmodOptions = SoftmodServiceOptions & {
  viewerUserId?: string | null;
};

export type CreateSoftmodInput = SoftmodServiceOptions & {
  authorId: string;
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
  const rows = db
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
  const { authorId, fileBytes, notes, dbPath, dataDir } = input;

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

  await writeOriginalZipmod(fileBytes, originalPath);

  const summaryJson = JSON.stringify(manifest.raw);

  db.transaction((tx) => {
    tx.insert(softmods)
      .values({
        id: softmodId,
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
  });

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

  const nextVersion = softmod.latestVersion + 1;
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { originalPath } = softmodVersionPaths(
    dataDir,
    softmodId,
    nextVersion,
  );

  await writeOriginalZipmod(fileBytes, originalPath);

  const summaryJson = JSON.stringify(manifest.raw);

  db.transaction((tx) => {
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
        title: manifest.name || softmod.title,
        modAuthor: manifest.author || null,
        description: manifest.description,
        website: manifest.website,
        latestVersion: nextVersion,
        updatedAt: now,
      })
      .where(eq(softmods.id, softmodId))
      .run();
  });

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
