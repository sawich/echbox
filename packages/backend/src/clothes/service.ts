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
  voteNetScore,
  type CatalogListQuery,
  type PaginatedList,
} from "../common/list-query";
import {
  contentIdsMatchingAllTagNames,
  tagFilterNames,
} from "../common/tag-filter";
import { getDb } from "../db/client";
import { newId } from "../id";
import { clothesVersions, clothesVotes, clothes, users } from "../db/schema";
import { KoikatuCoordinateEntry } from "../kkloader";
import { sha256Hex } from "../cards/hash";
import { writeWebpPreview } from "../cards/preview";
import {
  BadClothesError,
  DuplicateClothesHashError,
  DuplicateClothesSemverError,
  ForbiddenClothesError,
  ClothesNotFoundError,
} from "./errors";
import {
  loadContentOriginal,
  storeContentOriginal,
  type ContentBlobOptions,
} from "../proxy/content-blob-service";
import {
  getVersionPaths,
  removeClothesFiles,
  removeVersionFiles,
} from "./storage";
import { assertGameSupportsKind } from "../games/service";
import {
  getVoteCounts,
  getVoteCountsForClothes,
  type VoteCounts,
} from "./votes";

export {
  BadClothesError,
  DuplicateClothesHashError,
  DuplicateClothesSemverError,
  ForbiddenClothesError,
  ClothesNotFoundError,
  ClothesServiceError,
} from "./errors";

export type ClothesServiceOptions = ContentBlobOptions;

export type ClothesVersionDetail = CardDetail["versions"][number] & {
  contentHash: string;
  originalPath: string | null;
  previewPath: string;
};

export type ClothesDetail = Omit<CardDetail, "versions"> &
  VoteCounts & {
    gameId: string;
    uploaderId: string;
    authorUsername?: string | null;
    authorAvatar?: string | null;
    createdAt: string;
    updatedAt: string;
    versions: ClothesVersionDetail[];
  };

export type ClothesListItem = CardListItem &
  VoteCounts & {
    gameId: string;
    uploaderId: string;
  };

export type ListClothesOptions = ClothesServiceOptions &
  CatalogListQuery & {
    viewerUserId?: string | null;
    gameId?: string;
    uploaderId?: string;
    tags?: string[];
  };

export type GetClothesOptions = ClothesServiceOptions & {
  viewerUserId?: string | null;
};

export type CreateClothesInput = ClothesServiceOptions & {
  uploaderId: string;
  gameId: string;
  description?: string;
  fileBytes: Uint8Array;
  semver: string;
  notes?: string;
};

export type AddClothesVersionInput = ClothesServiceOptions & {
  clothesId: string;
  uploaderId: string;
  fileBytes: Uint8Array;
  semver: string;
  notes?: string;
};

export type PatchClothesInput = ClothesServiceOptions & {
  clothesId?: string;
  id?: string;
  uploaderId: string;
  description?: string;
  notes?: string;
};

export type DeleteClothesInput = ClothesServiceOptions & {
  clothesId?: string;
  id?: string;
  uploaderId: string;
};

export type DeleteClothesVersionInput = ClothesServiceOptions & {
  clothesId: string;
  versionId: string;
  uploaderId: string;
};

function imageUrl(clothesId: string, versionId: string | null): string {
  if (!versionId) return "";
  return `/api/clothes/${clothesId}/versions/${versionId}/image`;
}

function normalizeSemver(input: string | undefined): string {
  if (input === undefined || !input.trim()) {
    throw new BadClothesError("Version is required (for example 1.0.0).");
  }
  try {
    return parseSemver(input);
  } catch {
    throw new BadClothesError("Enter a valid version number (for example 1.0.0).");
  }
}

function humanizeClothesParseError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (
    /out of bounds/i.test(message) ||
    /unexpected eof/i.test(message) ||
    /truncated msgpack/i.test(message) ||
    /invalid png/i.test(message) ||
    /negative length/i.test(message)
  ) {
    return "Uploaded file is not a valid Koikatsu clothes card";
  }
  return message || "Invalid Koikatsu clothes card";
}

async function parseClothes(fileBytes: Uint8Array): Promise<KoikatuCoordinateEntry> {
  try {
    const entry = await KoikatuCoordinateEntry.load(fileBytes);
    const summary = entry.summary();
    if (!summary.header.includes("KoiKatuClothes")) {
      throw new BadClothesError("Uploaded file is not a valid Koikatsu clothes card");
    }
    return entry;
  } catch (err) {
    if (err instanceof BadClothesError) throw err;
    throw new BadClothesError(humanizeClothesParseError(err));
  }
}

export function findClothesByHash(
  hash: string,
  options?: ClothesServiceOptions,
): { clothesId: string; versionId: string; semver: string } | null {
  const normalized = hash.trim().toLowerCase();
  if (!normalized) return null;

  const db = getDb(options?.dbPath);
  const row = db
    .select({
      clothesId: clothesVersions.clothesId,
      versionId: clothesVersions.id,
      semver: clothesVersions.semver,
    })
    .from(clothesVersions)
    .where(eq(clothesVersions.contentHash, normalized))
    .get();

  if (!row) return null;
  return {
    clothesId: row.clothesId,
    versionId: row.versionId,
    semver: row.semver,
  };
}

export async function getClothes(
  id: string,
  options?: GetClothesOptions,
): Promise<ClothesDetail | null> {
  const db = getDb(options?.dbPath);
  const scene = db
    .select()
    .from(clothes)
    .where(eq(clothes.id, id))
    .get();

  if (!scene) return null;

  const versionRows = db
    .select()
    .from(clothesVersions)
    .where(eq(clothesVersions.clothesId, id))
    .all()
    .sort((a, b) => compareSemver(a.semver, b.semver));

  const versions: ClothesVersionDetail[] = versionRows.map((v) => ({
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
    .where(eq(users.id, scene.uploaderId))
    .get();

  return {
    id: scene.id,
    gameId: scene.gameId,
    type: "clothes",
    uploaderId: scene.uploaderId,
    authorUsername: author?.username ?? null,
    authorAvatar: author?.avatar ?? null,
    description: scene.description,
    latestSemver: scene.latestSemver,
    latestVersionId: scene.latestVersionId,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
    ...votes,
    versions,
  };
}

export async function listClothes(
  options?: ListClothesOptions,
): Promise<PaginatedList<ClothesListItem>> {
  const db = getDb(options?.dbPath);
  const { page, limit, offset, sort, unbounded } = resolveListWindow(options);
  const tagNames = tagFilterNames(options?.tags);
  const taggedIds = tagNames.length
    ? contentIdsMatchingAllTagNames({
        kind: "clothes",
        names: tagNames,
        dbPath: options?.dbPath,
      })
    : undefined;
  if (taggedIds && taggedIds.length === 0) {
    return { items: [], total: 0, page, limit: unbounded ? 0 : limit };
  }

  const whereClause = and(
    options?.gameId ? eq(clothes.gameId, options.gameId) : undefined,
    options?.uploaderId ? eq(clothes.uploaderId, options.uploaderId) : undefined,
    taggedIds ? inArray(clothes.id, taggedIds) : undefined,
  );
  const score = voteNetScore("clothes_votes", "clothes_id", clothes.id);
  const order = orderBySort(
    sort === "title" ? "recent" : sort,
    clothes.createdAt,
    clothes.createdAt,
    score,
  );

  const total =
    db
      .select({ value: count() })
      .from(clothes)
      .where(whereClause)
      .get()?.value ?? 0;

  if (total === 0) {
    return { items: [], total: 0, page, limit: unbounded ? 0 : limit };
  }

  const rows = unbounded
    ? db
        .select()
        .from(clothes)
        .where(whereClause)
        .orderBy(...order)
        .all()
    : db
        .select()
        .from(clothes)
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
          .from(clothesVersions)
          .where(inArray(clothesVersions.clothesId, ids))
          .all();

  const versionsByScene = new Map<string, (typeof pageVersions)[number][]>();
  for (const v of pageVersions) {
    const arr = versionsByScene.get(v.clothesId) ?? [];
    arr.push(v);
    versionsByScene.set(v.clothesId, arr);
  }

  const voteMap = getVoteCountsForClothes(
    ids,
    options?.viewerUserId,
    options?.dbPath,
  );

  const items: ClothesListItem[] = [];
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
      type: "clothes",
      uploaderId: scene.uploaderId,
      description: scene.description,
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

export async function createClothes(
  input: CreateClothesInput,
): Promise<
  ClothesDetail & {
    clothesId: string;
    versionId: string;
    semver: string;
    contentHash: string;
    originalPath: string | null;
    previewPath: string;
  }
> {
  const { uploaderId, gameId, fileBytes, notes, dbPath, dataDir } = input;

  const semver = normalizeSemver(input.semver);
  assertGameSupportsKind(gameId, "clothes", { dbPath });

  const contentHash = sha256Hex(fileBytes);
  const existing = findClothesByHash(contentHash, { dbPath });
  if (existing) {
    throw new DuplicateClothesHashError(
      existing.clothesId,
      existing.versionId,
      existing.semver,
    );
  }

  const ks = await parseClothes(fileBytes);

  const clothesId = newId();
  const versionId = newId();
  const now = new Date().toISOString();

  const summary = ks.summary();

  const { previewPath } = getVersionPaths(
    clothesId,
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
  const summaryJson = JSON.stringify(summary);

  db.transaction((tx) => {
    tx.insert(clothes)
      .values({
        id: clothesId,
        gameId,
        uploaderId,
        description: input.description ?? "",
        latestSemver: semver,
        latestVersionId: versionId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    tx.insert(clothesVersions)
      .values({
        id: versionId,
        clothesId,
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

  const detail = await getClothes(clothesId, { dbPath, dataDir });
  return {
    ...detail!,
    clothesId,
    versionId,
    semver,
    contentHash,
    originalPath: null,
    previewPath,
  };
}

export async function addClothesVersion(
  input: AddClothesVersionInput,
): Promise<
  ClothesDetail & {
    clothesId: string;
    versionId: string;
    semver: string;
    contentHash: string;
    originalPath: string | null;
    previewPath: string;
  }
> {
  const { clothesId, uploaderId, fileBytes, notes, dbPath, dataDir } = input;
  const semver = normalizeSemver(input.semver);
  const db = getDb(dbPath);

  const scene = db
    .select()
    .from(clothes)
    .where(eq(clothes.id, clothesId))
    .get();

  if (!scene) {
    throw new ClothesNotFoundError();
  }

  if (scene.uploaderId !== uploaderId) {
    throw new ForbiddenClothesError();
  }

  const contentHash = sha256Hex(fileBytes);
  const existing = findClothesByHash(contentHash, { dbPath });
  if (existing) {
    throw new DuplicateClothesHashError(
      existing.clothesId,
      existing.versionId,
      existing.semver,
    );
  }

  const duplicateSemver = db
    .select({ id: clothesVersions.id })
    .from(clothesVersions)
    .where(
      and(
        eq(clothesVersions.clothesId, clothesId),
        eq(clothesVersions.semver, semver),
      ),
    )
    .get();
  if (duplicateSemver) {
    throw new DuplicateClothesSemverError(clothesId, semver);
  }

  const ks = await parseClothes(fileBytes);

  const versionId = newId();
  const now = new Date().toISOString();

  const { previewPath } = getVersionPaths(
    clothesId,
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
    tx.insert(clothesVersions)
      .values({
        id: versionId,
        clothesId,
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
      .select({ id: clothesVersions.id, semver: clothesVersions.semver })
      .from(clothesVersions)
      .where(eq(clothesVersions.clothesId, clothesId))
      .all();
    const latest = pickLatestBySemver(allVersions)!;

    tx.update(clothes)
      .set({
        latestSemver: latest.semver,
        latestVersionId: latest.id,
        updatedAt: now,
      })
      .where(eq(clothes.id, clothesId))
      .run();
  });

  const detail = await getClothes(clothesId, { dbPath, dataDir });
  return {
    ...detail!,
    clothesId,
    versionId,
    semver,
    contentHash,
    originalPath: null,
    previewPath,
  };
}

export async function patchClothes(
  clothesIdOrInput: string | PatchClothesInput,
  maybePatch?: Omit<PatchClothesInput, "clothesId" | "id">,
): Promise<ClothesDetail> {
  const input: PatchClothesInput =
    typeof clothesIdOrInput === "string"
      ? { clothesId: clothesIdOrInput, ...maybePatch! }
      : clothesIdOrInput;

  const targetId = input.clothesId ?? input.id;
  if (!targetId) {
    throw new ClothesNotFoundError("Missing clothesId");
  }

  const db = getDb(input.dbPath);
  const scene = db
    .select()
    .from(clothes)
    .where(eq(clothes.id, targetId))
    .get();

  if (!scene) {
    throw new ClothesNotFoundError();
  }

  if (scene.uploaderId !== input.uploaderId) {
    throw new ForbiddenClothesError();
  }

  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.update(clothes)
      .set({
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        updatedAt: now,
      })
      .where(eq(clothes.id, targetId))
      .run();

    if (input.notes !== undefined && scene.latestVersionId) {
      tx.update(clothesVersions)
        .set({
          notes: input.notes,
        })
        .where(
          and(
            eq(clothesVersions.clothesId, targetId),
            eq(clothesVersions.id, scene.latestVersionId),
          ),
        )
        .run();
    }
  });

  const updated = await getClothes(targetId, {
    dbPath: input.dbPath,
    dataDir: input.dataDir,
  });
  return updated!;
}

export async function deleteClothesVersion(
  input: DeleteClothesVersionInput,
): Promise<ClothesDetail> {
  const { clothesId, versionId, uploaderId, dbPath, dataDir } = input;
  const db = getDb(dbPath);

  const scene = db
    .select()
    .from(clothes)
    .where(eq(clothes.id, clothesId))
    .get();

  if (!scene) {
    throw new ClothesNotFoundError();
  }

  if (scene.uploaderId !== uploaderId) {
    throw new ForbiddenClothesError();
  }

  const version = db
    .select()
    .from(clothesVersions)
    .where(
      and(
        eq(clothesVersions.clothesId, clothesId),
        eq(clothesVersions.id, versionId),
      ),
    )
    .get();

  if (!version) {
    throw new ClothesNotFoundError("Version not found");
  }

  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.delete(clothesVersions).where(eq(clothesVersions.id, versionId)).run();

    const remaining = tx
      .select({ id: clothesVersions.id, semver: clothesVersions.semver })
      .from(clothesVersions)
      .where(eq(clothesVersions.clothesId, clothesId))
      .all();

    const latest = pickLatestBySemver(remaining);

    tx.update(clothes)
      .set({
        latestSemver: latest?.semver ?? null,
        latestVersionId: latest?.id ?? null,
        updatedAt: now,
      })
      .where(eq(clothes.id, clothesId))
      .run();
  });

  await removeVersionFiles(clothesId, versionId, dataDir);

  const detail = await getClothes(clothesId, { dbPath, dataDir });
  return detail!;
}

export async function deleteClothes(
  clothesIdOrInput: string | DeleteClothesInput,
  maybeAuthorOrInput?: string | Omit<DeleteClothesInput, "clothesId" | "id">,
): Promise<{ ok: true; id: string }> {
  const input: DeleteClothesInput =
    typeof clothesIdOrInput === "string"
      ? typeof maybeAuthorOrInput === "string"
        ? { clothesId: clothesIdOrInput, uploaderId: maybeAuthorOrInput }
        : { clothesId: clothesIdOrInput, ...maybeAuthorOrInput! }
      : clothesIdOrInput;

  const targetId = input.clothesId ?? input.id;
  if (!targetId) {
    throw new ClothesNotFoundError("Missing clothesId");
  }

  const db = getDb(input.dbPath);
  const scene = db
    .select()
    .from(clothes)
    .where(eq(clothes.id, targetId))
    .get();

  if (!scene) {
    throw new ClothesNotFoundError();
  }

  if (scene.uploaderId !== input.uploaderId) {
    throw new ForbiddenClothesError();
  }

  db.transaction((tx) => {
    tx.delete(clothesVotes).where(eq(clothesVotes.clothesId, targetId)).run();
    tx.delete(clothesVersions).where(eq(clothesVersions.clothesId, targetId)).run();
    tx.delete(clothes).where(eq(clothes.id, targetId)).run();
  });

  await removeClothesFiles(targetId, input.dataDir);

  return { ok: true, id: targetId };
}

export async function getClothesVersionImage(
  clothesId: string,
  versionId: string,
  options?: ClothesServiceOptions & { original?: boolean },
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const db = getDb(options?.dbPath);
  const row = db
    .select()
    .from(clothesVersions)
    .where(
      and(
        eq(clothesVersions.clothesId, clothesId),
        eq(clothesVersions.id, versionId),
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

export function createClothesService(options: ClothesServiceOptions = {}) {
  return {
    createClothes: (input: Omit<CreateClothesInput, "dbPath" | "dataDir">) =>
      createClothes({ ...options, ...input }),
    addClothesVersion: (input: Omit<AddClothesVersionInput, "dbPath" | "dataDir">) =>
      addClothesVersion({ ...options, ...input }),
    findClothesByHash: (hash: string) => findClothesByHash(hash, options),
    listClothes: () => listClothes(options),
    getClothes: (id: string, opts?: { viewerUserId?: string | null }) =>
      getClothes(id, { ...options, ...opts }),
    patchClothes: (
      clothesIdOrInput: string | PatchClothesInput,
      maybePatch?: Omit<PatchClothesInput, "clothesId" | "id">,
    ) => {
      if (typeof clothesIdOrInput === "string") {
        return patchClothes(clothesIdOrInput, { ...options, ...maybePatch! });
      }
      return patchClothes({ ...options, ...clothesIdOrInput });
    },
    deleteClothes: (
      clothesIdOrInput: string | DeleteClothesInput,
      maybeAuthorOrInput?: string | Omit<DeleteClothesInput, "clothesId" | "id">,
    ) => {
      if (typeof clothesIdOrInput === "string") {
        if (typeof maybeAuthorOrInput === "string") {
          return deleteClothes({
            ...options,
            clothesId: clothesIdOrInput,
            uploaderId: maybeAuthorOrInput,
          });
        }
        return deleteClothes(clothesIdOrInput, { ...options, ...maybeAuthorOrInput! });
      }
      return deleteClothes({ ...options, ...clothesIdOrInput });
    },
    deleteClothesVersion: (
      input: Omit<DeleteClothesVersionInput, "dbPath" | "dataDir">,
    ) => deleteClothesVersion({ ...options, ...input }),
    getClothesVersionImage: (
      clothesId: string,
      versionId: string,
      opts?: { original?: boolean },
    ) => getClothesVersionImage(clothesId, versionId, { ...options, ...opts }),
  };
}
