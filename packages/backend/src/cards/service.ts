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
import {
  cardVotes,
  characterCardVersions,
  characterCards,
  users,
} from "../db/schema";
import { KoikatuCharaData } from "../kkloader";
import {
  BadCardError,
  CardNotFoundError,
  DuplicateCardHashError,
  DuplicateCardSemverError,
  ForbiddenCardError,
} from "./errors";
import { sha256Hex } from "./hash";
import { writeWebpPreview } from "./preview";
import {
  loadContentOriginal,
  storeContentOriginal,
  type ContentBlobOptions,
} from "../proxy/content-blob-service";
import {
  getVersionPaths,
  removeCardFiles,
  removeVersionFiles,
} from "./storage";
import { assertGameSupportsKind } from "../games/service";
import {
  getVoteCounts,
  getVoteCountsForCards,
  type VoteCounts,
} from "./votes";

export {
  BadCardError,
  CardNotFoundError,
  CardServiceError,
  DuplicateCardHashError,
  DuplicateCardSemverError,
  ForbiddenCardError,
} from "./errors";

export type CardServiceOptions = ContentBlobOptions;

export type CharacterCardVersionDetail = CardDetail["versions"][number] & {
  contentHash: string;
  originalPath: string | null;
  previewPath: string;
};

export type CharacterCardDetail = Omit<CardDetail, "versions"> &
  VoteCounts & {
    gameId: string;
    authorId: string;
    authorUsername?: string | null;
    authorAvatar?: string | null;
    createdAt: string;
    updatedAt: string;
    versions: CharacterCardVersionDetail[];
  };

export type CharacterCardListItem = CardListItem &
  VoteCounts & {
    gameId: string;
    authorId: string;
  };

export type ListCharactersOptions = CardServiceOptions &
  CatalogListQuery & {
    viewerUserId?: string | null;
    gameId?: string;
    authorId?: string;
  };

export type GetCardOptions = CardServiceOptions & {
  viewerUserId?: string | null;
};

export type CreateCardInput = CardServiceOptions & {
  authorId: string;
  gameId: string;
  title?: string;
  slug?: string;
  fileBytes: Uint8Array;
  semver: string;
  notes?: string;
};

export type AddVersionInput = CardServiceOptions & {
  cardId: string;
  authorId: string;
  fileBytes: Uint8Array;
  semver: string;
  notes?: string;
};

export type PatchCardInput = CardServiceOptions & {
  cardId?: string;
  id?: string;
  authorId: string;
  title?: string;
  slug?: string;
  notes?: string;
};

export type DeleteCardInput = CardServiceOptions & {
  cardId?: string;
  id?: string;
  authorId: string;
};

export type DeleteVersionInput = CardServiceOptions & {
  cardId: string;
  versionId: string;
  authorId: string;
};

function imageUrl(cardId: string, versionId: string | null): string {
  if (!versionId) return "";
  return `/api/kk/cards/${cardId}/versions/${versionId}/image`;
}

function normalizeSemver(input: string | undefined): string {
  if (input === undefined || !input.trim()) {
    throw new BadCardError("Version is required (for example 1.0.0).");
  }
  try {
    return parseSemver(input);
  } catch {
    throw new BadCardError("Enter a valid version number (for example 1.0.0).");
  }
}

function slugify(input: string, fallbackId: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `card-${fallbackId.slice(0, 8)}`;
}

function humanizeCardParseError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (
    /out of bounds/i.test(message) ||
    /unexpected eof/i.test(message) ||
    /truncated msgpack/i.test(message) ||
    /invalid png/i.test(message) ||
    /negative length/i.test(message)
  ) {
    return "Uploaded file is not a valid Koikatsu character card";
  }
  return message || "Invalid Koikatsu character card";
}

async function parseCharacterCard(fileBytes: Uint8Array): Promise<KoikatuCharaData> {
  try {
    const kc = await KoikatuCharaData.load(fileBytes);
    const summary = kc.summary();
    if (!summary.header.includes("KoiKatuChara") || kc.blockdata.length === 0) {
      throw new BadCardError("Uploaded file is not a valid Koikatsu character card");
    }
    return kc;
  } catch (err) {
    if (err instanceof BadCardError) throw err;
    throw new BadCardError(humanizeCardParseError(err));
  }
}

export function findByHash(
  hash: string,
  options?: CardServiceOptions,
): { cardId: string; versionId: string; semver: string } | null {
  const normalized = hash.trim().toLowerCase();
  if (!normalized) return null;

  const db = getDb(options?.dbPath);
  const row = db
    .select({
      cardId: characterCardVersions.cardId,
      versionId: characterCardVersions.id,
      semver: characterCardVersions.semver,
    })
    .from(characterCardVersions)
    .where(eq(characterCardVersions.contentHash, normalized))
    .get();

  if (!row) return null;
  return {
    cardId: row.cardId,
    versionId: row.versionId,
    semver: row.semver,
  };
}

export async function getCard(
  id: string,
  options?: GetCardOptions,
): Promise<CharacterCardDetail | null> {
  const db = getDb(options?.dbPath);
  const card = db
    .select()
    .from(characterCards)
    .where(eq(characterCards.id, id))
    .get();

  if (!card) return null;

  const versionRows = db
    .select()
    .from(characterCardVersions)
    .where(eq(characterCardVersions.cardId, id))
    .all()
    .sort((a, b) => compareSemver(a.semver, b.semver));

  const versions: CharacterCardVersionDetail[] = versionRows.map((v) => ({
    id: v.id,
    semver: v.semver,
    createdAt: v.createdAt,
    ...(v.notes != null ? { notes: v.notes } : {}),
    imageUrl: imageUrl(card.id, v.id),
    summary: JSON.parse(v.summaryJson) as Record<string, unknown>,
    contentHash: v.contentHash,
    originalPath: v.originalPath,
    previewPath: v.previewPath,
  }));

  const votes = getVoteCounts(card.id, options?.viewerUserId, options?.dbPath);
  const author = db
    .select({
      username: users.username,
      avatar: users.avatar,
    })
    .from(users)
    .where(eq(users.id, card.authorId))
    .get();

  return {
    id: card.id,
    gameId: card.gameId,
    type: "character",
    authorId: card.authorId,
    authorUsername: author?.username ?? null,
    authorAvatar: author?.avatar ?? null,
    slug: card.slug,
    title: card.title,
    latestSemver: card.latestSemver,
    latestVersionId: card.latestVersionId,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    ...votes,
    versions,
  };
}

export async function listCharacters(
  options?: ListCharactersOptions,
): Promise<PaginatedList<CharacterCardListItem>> {
  const db = getDb(options?.dbPath);
  const { page, limit, offset, sort, q, unbounded } = resolveListWindow(options);

  const whereClause = and(
    options?.gameId ? eq(characterCards.gameId, options.gameId) : undefined,
    options?.authorId
      ? eq(characterCards.authorId, options.authorId)
      : undefined,
    titleSlugSearch(characterCards.title, characterCards.slug, q),
  );
  const score = voteNetScore("card_votes", "card_id", characterCards.id);
  const order = orderBySort(
    sort,
    characterCards.createdAt,
    characterCards.title,
    score,
  );

  const total =
    db
      .select({ value: count() })
      .from(characterCards)
      .where(whereClause)
      .get()?.value ?? 0;

  if (total === 0) {
    return { items: [], total: 0, page, limit: unbounded ? 0 : limit };
  }

  const cards = unbounded
    ? db
        .select()
        .from(characterCards)
        .where(whereClause)
        .orderBy(...order)
        .all()
    : db
        .select()
        .from(characterCards)
        .where(whereClause)
        .orderBy(...order)
        .limit(limit)
        .offset(offset)
        .all();

  const ids = cards.map((c) => c.id);
  const pageVersions =
    ids.length === 0
      ? []
      : db
          .select()
          .from(characterCardVersions)
          .where(inArray(characterCardVersions.cardId, ids))
          .all();

  const versionsByCard = new Map<string, (typeof pageVersions)[number][]>();
  for (const v of pageVersions) {
    const arr = versionsByCard.get(v.cardId) ?? [];
    arr.push(v);
    versionsByCard.set(v.cardId, arr);
  }

  const voteMap = getVoteCountsForCards(
    ids,
    options?.viewerUserId,
    options?.dbPath,
  );

  const items: CharacterCardListItem[] = [];
  for (const card of cards) {
    const versions = versionsByCard.get(card.id) ?? [];
    const latestRow =
      versions.find((v) => v.id === card.latestVersionId) ??
      pickLatestBySemver(versions) ??
      undefined;

    const summary = latestRow
      ? (JSON.parse(latestRow.summaryJson) as Record<string, unknown>)
      : {};

    const votes = voteMap.get(card.id) ?? {
      likes: 0,
      dislikes: 0,
      myVote: null,
    };

    items.push({
      id: card.id,
      gameId: card.gameId,
      type: "character",
      authorId: card.authorId,
      slug: card.slug,
      title: card.title,
      latestSemver: card.latestSemver,
      latestVersionId: card.latestVersionId,
      versionCount: versions.length,
      imageUrl: imageUrl(card.id, card.latestVersionId),
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

export async function createCard(
  input: CreateCardInput,
): Promise<
  CharacterCardDetail & {
    cardId: string;
    versionId: string;
    semver: string;
    contentHash: string;
    originalPath: string | null;
    previewPath: string;
  }
> {
  const { authorId, gameId, title, slug, fileBytes, notes, dbPath, dataDir } =
    input;

  const semver = normalizeSemver(input.semver);
  assertGameSupportsKind(gameId, "cards", { dbPath });

  const contentHash = sha256Hex(fileBytes);
  const existing = findByHash(contentHash, { dbPath });
  if (existing) {
    throw new DuplicateCardHashError(
      existing.cardId,
      existing.versionId,
      existing.semver,
    );
  }

  const kc = await parseCharacterCard(fileBytes);

  const cardId = newId();
  const versionId = newId();
  const now = new Date().toISOString();

  const resolvedTitle = title?.trim() || kc.name?.trim() || "Untitled";
  const resolvedSlug = slug?.trim()
    ? slugify(slug, cardId)
    : slugify(resolvedTitle, cardId);

  const { previewPath } = getVersionPaths(
    cardId,
    versionId,
    dataDir,
  );

  let previewSource = kc.image ?? kc.faceImage;
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
  const summaryJson = JSON.stringify(kc.summary());

  db.transaction((tx) => {
    tx.insert(characterCards)
      .values({
        id: cardId,
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

    tx.insert(characterCardVersions)
      .values({
        id: versionId,
        cardId,
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

  const detail = await getCard(cardId, { dbPath, dataDir });
  return {
    ...detail!,
    cardId,
    versionId,
    semver,
    contentHash,
    originalPath: null,
    previewPath,
  };
}

export async function addVersion(
  input: AddVersionInput,
): Promise<
  CharacterCardDetail & {
    cardId: string;
    versionId: string;
    semver: string;
    contentHash: string;
    originalPath: string | null;
    previewPath: string;
  }
> {
  const { cardId, authorId, fileBytes, notes, dbPath, dataDir } = input;
  const semver = normalizeSemver(input.semver);
  const db = getDb(dbPath);

  const card = db
    .select()
    .from(characterCards)
    .where(eq(characterCards.id, cardId))
    .get();

  if (!card) {
    throw new CardNotFoundError();
  }

  if (card.authorId !== authorId) {
    throw new ForbiddenCardError();
  }

  const contentHash = sha256Hex(fileBytes);
  const existing = findByHash(contentHash, { dbPath });
  if (existing) {
    throw new DuplicateCardHashError(
      existing.cardId,
      existing.versionId,
      existing.semver,
    );
  }

  const duplicateSemver = db
    .select({ id: characterCardVersions.id })
    .from(characterCardVersions)
    .where(
      and(
        eq(characterCardVersions.cardId, cardId),
        eq(characterCardVersions.semver, semver),
      ),
    )
    .get();
  if (duplicateSemver) {
    throw new DuplicateCardSemverError(cardId, semver);
  }

  const kc = await parseCharacterCard(fileBytes);

  const versionId = newId();
  const now = new Date().toISOString();

  const { previewPath } = getVersionPaths(
    cardId,
    versionId,
    dataDir,
  );

  let previewSource = kc.image ?? kc.faceImage;
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

  const summaryJson = JSON.stringify(kc.summary());

  db.transaction((tx) => {
    tx.insert(characterCardVersions)
      .values({
        id: versionId,
        cardId,
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
      .select({
        id: characterCardVersions.id,
        semver: characterCardVersions.semver,
      })
      .from(characterCardVersions)
      .where(eq(characterCardVersions.cardId, cardId))
      .all();
    const latest = pickLatestBySemver(allVersions)!;

    tx.update(characterCards)
      .set({
        latestSemver: latest.semver,
        latestVersionId: latest.id,
        updatedAt: now,
      })
      .where(eq(characterCards.id, cardId))
      .run();
  });

  const detail = await getCard(cardId, { dbPath, dataDir });
  return {
    ...detail!,
    cardId,
    versionId,
    semver,
    contentHash,
    originalPath: null,
    previewPath,
  };
}

export async function patchCard(
  cardIdOrInput: string | PatchCardInput,
  maybePatch?: Omit<PatchCardInput, "cardId" | "id">,
): Promise<CharacterCardDetail> {
  const input: PatchCardInput =
    typeof cardIdOrInput === "string"
      ? { cardId: cardIdOrInput, ...maybePatch! }
      : cardIdOrInput;

  const targetId = input.cardId ?? input.id;
  if (!targetId) {
    throw new CardNotFoundError("Missing cardId");
  }

  const db = getDb(input.dbPath);
  const card = db
    .select()
    .from(characterCards)
    .where(eq(characterCards.id, targetId))
    .get();

  if (!card) {
    throw new CardNotFoundError();
  }

  if (card.authorId !== input.authorId) {
    throw new ForbiddenCardError();
  }

  const now = new Date().toISOString();
  const nextTitle = input.title?.trim() ? input.title.trim() : card.title;
  const nextSlug = input.slug?.trim()
    ? slugify(input.slug, targetId)
    : input.title?.trim() && input.slug === undefined
      ? card.slug
      : card.slug;

  db.transaction((tx) => {
    tx.update(characterCards)
      .set({
        title: nextTitle,
        slug: nextSlug,
        updatedAt: now,
      })
      .where(eq(characterCards.id, targetId))
      .run();

    if (input.notes !== undefined && card.latestVersionId) {
      tx.update(characterCardVersions)
        .set({
          notes: input.notes,
        })
        .where(
          and(
            eq(characterCardVersions.cardId, targetId),
            eq(characterCardVersions.id, card.latestVersionId),
          ),
        )
        .run();
    }
  });

  const updated = await getCard(targetId, {
    dbPath: input.dbPath,
    dataDir: input.dataDir,
  });
  return updated!;
}

export async function deleteVersion(
  input: DeleteVersionInput,
): Promise<CharacterCardDetail> {
  const { cardId, versionId, authorId, dbPath, dataDir } = input;
  const db = getDb(dbPath);

  const card = db
    .select()
    .from(characterCards)
    .where(eq(characterCards.id, cardId))
    .get();

  if (!card) {
    throw new CardNotFoundError();
  }

  if (card.authorId !== authorId) {
    throw new ForbiddenCardError();
  }

  const version = db
    .select()
    .from(characterCardVersions)
    .where(
      and(
        eq(characterCardVersions.cardId, cardId),
        eq(characterCardVersions.id, versionId),
      ),
    )
    .get();

  if (!version) {
    throw new CardNotFoundError("Version not found");
  }

  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.delete(characterCardVersions)
      .where(eq(characterCardVersions.id, versionId))
      .run();

    const remaining = tx
      .select({
        id: characterCardVersions.id,
        semver: characterCardVersions.semver,
      })
      .from(characterCardVersions)
      .where(eq(characterCardVersions.cardId, cardId))
      .all();

    const latest = pickLatestBySemver(remaining);

    tx.update(characterCards)
      .set({
        latestSemver: latest?.semver ?? null,
        latestVersionId: latest?.id ?? null,
        updatedAt: now,
      })
      .where(eq(characterCards.id, cardId))
      .run();
  });

  await removeVersionFiles(cardId, versionId, dataDir);

  const detail = await getCard(cardId, { dbPath, dataDir });
  return detail!;
}

export async function deleteCard(
  cardIdOrInput: string | DeleteCardInput,
  maybeAuthorOrInput?: string | Omit<DeleteCardInput, "cardId" | "id">,
): Promise<{ ok: true; id: string }> {
  const input: DeleteCardInput =
    typeof cardIdOrInput === "string"
      ? typeof maybeAuthorOrInput === "string"
        ? { cardId: cardIdOrInput, authorId: maybeAuthorOrInput }
        : { cardId: cardIdOrInput, ...maybeAuthorOrInput! }
      : cardIdOrInput;

  const targetId = input.cardId ?? input.id;
  if (!targetId) {
    throw new CardNotFoundError("Missing cardId");
  }

  const db = getDb(input.dbPath);
  const card = db
    .select()
    .from(characterCards)
    .where(eq(characterCards.id, targetId))
    .get();

  if (!card) {
    throw new CardNotFoundError();
  }

  if (card.authorId !== input.authorId) {
    throw new ForbiddenCardError();
  }

  db.transaction((tx) => {
    tx.delete(cardVotes).where(eq(cardVotes.cardId, targetId)).run();
    tx.delete(characterCardVersions)
      .where(eq(characterCardVersions.cardId, targetId))
      .run();
    tx.delete(characterCards).where(eq(characterCards.id, targetId)).run();
  });

  await removeCardFiles(targetId, input.dataDir);

  return { ok: true, id: targetId };
}

export async function getVersionImage(
  cardId: string,
  versionId: string,
  options?: CardServiceOptions & { original?: boolean },
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const db = getDb(options?.dbPath);
  const row = db
    .select()
    .from(characterCardVersions)
    .where(
      and(
        eq(characterCardVersions.cardId, cardId),
        eq(characterCardVersions.id, versionId),
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

export function createCardService(options: CardServiceOptions = {}) {
  return {
    createCard: (input: Omit<CreateCardInput, "dbPath" | "dataDir">) =>
      createCard({ ...options, ...input }),
    addVersion: (input: Omit<AddVersionInput, "dbPath" | "dataDir">) =>
      addVersion({ ...options, ...input }),
    findByHash: (hash: string) => findByHash(hash, options),
    listCharacters: () => listCharacters(options),
    getCard: (id: string) => getCard(id, options),
    patchCard: (
      cardIdOrInput: string | PatchCardInput,
      maybePatch?: Omit<PatchCardInput, "cardId" | "id">,
    ) => {
      if (typeof cardIdOrInput === "string") {
        return patchCard(cardIdOrInput, { ...options, ...maybePatch! });
      }
      return patchCard({ ...options, ...cardIdOrInput });
    },
    deleteCard: (
      cardIdOrInput: string | DeleteCardInput,
      maybeAuthorOrInput?: string | Omit<DeleteCardInput, "cardId" | "id">,
    ) => {
      if (typeof cardIdOrInput === "string") {
        if (typeof maybeAuthorOrInput === "string") {
          return deleteCard({
            ...options,
            cardId: cardIdOrInput,
            authorId: maybeAuthorOrInput,
          });
        }
        return deleteCard(cardIdOrInput, { ...options, ...maybeAuthorOrInput! });
      }
      return deleteCard({ ...options, ...cardIdOrInput });
    },
    deleteVersion: (input: Omit<DeleteVersionInput, "dbPath" | "dataDir">) =>
      deleteVersion({ ...options, ...input }),
    getVersionImage: (
      cardId: string,
      versionId: string,
      opts?: { original?: boolean },
    ) => getVersionImage(cardId, versionId, { ...options, ...opts }),
  };
}
