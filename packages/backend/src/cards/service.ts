import {
  compareSemver,
  parseSemver,
  pickLatestBySemver,
  type CardDetail,
  type CardListItem,
} from "@echbox/shared";
import { and, desc, eq } from "drizzle-orm";
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
import { getVersionPaths, removeCardFiles, writeOriginalPng } from "./storage";
import { assertGameExists } from "../games/service";
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

export type CardServiceOptions = {
  dbPath?: string;
  dataDir?: string;
};

export type CharacterCardVersionDetail = CardDetail["versions"][number] & {
  contentHash: string;
  originalPath: string;
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

export type ListCharactersOptions = CardServiceOptions & {
  viewerUserId?: string | null;
  gameId?: string;
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

function imageUrl(cardId: string, versionId: string): string {
  return `/api/kk/cards/${cardId}/versions/${versionId}/image`;
}

function normalizeSemver(input: string | undefined): string {
  if (input === undefined || !input.trim()) {
    throw new BadCardError("semver is required");
  }
  try {
    return parseSemver(input);
  } catch {
    throw new BadCardError(`Invalid semver: ${input}`);
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
    throw new BadCardError(
      err instanceof Error ? err.message : "Invalid Koikatsu character card",
    );
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
): Promise<CharacterCardListItem[]> {
  const db = getDb(options?.dbPath);
  const cards = options?.gameId
    ? db
        .select()
        .from(characterCards)
        .where(eq(characterCards.gameId, options.gameId))
        .orderBy(desc(characterCards.createdAt))
        .all()
    : db
        .select()
        .from(characterCards)
        .orderBy(desc(characterCards.createdAt))
        .all();

  if (cards.length === 0) return [];

  const allVersions = db
    .select()
    .from(characterCardVersions)
    .all();

  const versionsByCard = new Map<string, (typeof allVersions)[number][]>();
  for (const v of allVersions) {
    const arr = versionsByCard.get(v.cardId) ?? [];
    arr.push(v);
    versionsByCard.set(v.cardId, arr);
  }

  const voteMap = getVoteCountsForCards(
    cards.map((c) => c.id),
    options?.viewerUserId,
    options?.dbPath,
  );

  const out: CharacterCardListItem[] = [];
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

    out.push({
      id: card.id,
      gameId: card.gameId,
      type: "character",
      authorId: card.authorId,
      slug: card.slug,
      title: card.title,
      latestSemver: card.latestSemver,
      latestVersionId: card.latestVersionId,
      versionCount: versions.length || 1,
      imageUrl: imageUrl(card.id, card.latestVersionId),
      summary,
      ...votes,
    });
  }

  return out;
}

export async function createCard(
  input: CreateCardInput,
): Promise<
  CharacterCardDetail & {
    cardId: string;
    versionId: string;
    semver: string;
    contentHash: string;
    originalPath: string;
    previewPath: string;
  }
> {
  const { authorId, gameId, title, slug, fileBytes, notes, dbPath, dataDir } =
    input;

  const semver = normalizeSemver(input.semver);
  assertGameExists(gameId, { dbPath });

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

  const { originalPath, previewPath } = getVersionPaths(
    cardId,
    versionId,
    dataDir,
  );

  let previewSource = kc.image ?? kc.faceImage;
  if (!previewSource || previewSource.byteLength === 0) {
    previewSource = fileBytes;
  }

  await writeWebpPreview(previewSource, previewPath);
  await writeOriginalPng(fileBytes, originalPath);

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
        originalPath,
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
    originalPath,
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
    originalPath: string;
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

  const { originalPath, previewPath } = getVersionPaths(
    cardId,
    versionId,
    dataDir,
  );

  let previewSource = kc.image ?? kc.faceImage;
  if (!previewSource || previewSource.byteLength === 0) {
    previewSource = fileBytes;
  }

  await writeWebpPreview(previewSource, previewPath);
  await writeOriginalPng(fileBytes, originalPath);

  const summaryJson = JSON.stringify(kc.summary());

  db.transaction((tx) => {
    tx.insert(characterCardVersions)
      .values({
        id: versionId,
        cardId,
        semver,
        notes: notes ?? null,
        contentHash,
        originalPath,
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
    originalPath,
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

    if (input.notes !== undefined) {
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

  const filePath = options?.original ? row.originalPath : row.previewPath;
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;

  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    contentType: options?.original ? "image/png" : "image/webp",
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
    getVersionImage: (
      cardId: string,
      versionId: string,
      opts?: { original?: boolean },
    ) => getVersionImage(cardId, versionId, { ...options, ...opts }),
  };
}
