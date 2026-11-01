import type { CardDetail, CardListItem } from "@echbox/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
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
  ForbiddenCardError,
} from "./errors";
import { sha256Hex } from "./hash";
import { writeWebpPreview } from "./preview";
import { getVersionPaths, removeCardFiles, writeOriginalPng } from "./storage";
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
    authorId: string;
    authorUsername?: string | null;
    authorAvatar?: string | null;
    createdAt: string;
    updatedAt: string;
    versions: CharacterCardVersionDetail[];
  };

export type CharacterCardListItem = CardListItem &
  VoteCounts & {
    authorId: string;
  };

export type ListCharactersOptions = CardServiceOptions & {
  viewerUserId?: string | null;
};

export type GetCardOptions = CardServiceOptions & {
  viewerUserId?: string | null;
};

export type CreateCardInput = CardServiceOptions & {
  authorId: string;
  title?: string;
  slug?: string;
  fileBytes: Uint8Array;
  notes?: string;
};

export type AddVersionInput = CardServiceOptions & {
  cardId: string;
  authorId: string;
  fileBytes: Uint8Array;
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

function imageUrl(cardId: string, version: number): string {
  return `/api/kk/cards/${cardId}/versions/${version}/image`;
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
): { cardId: string; version: number } | null {
  const normalized = hash.trim().toLowerCase();
  if (!normalized) return null;

  const db = getDb(options?.dbPath);
  const row = db
    .select({
      cardId: characterCardVersions.cardId,
      version: characterCardVersions.version,
    })
    .from(characterCardVersions)
    .where(eq(characterCardVersions.contentHash, normalized))
    .get();

  if (!row) return null;
  return {
    cardId: row.cardId,
    version: row.version,
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
    .orderBy(asc(characterCardVersions.version))
    .all();

  const versions: CharacterCardVersionDetail[] = versionRows.map((v) => ({
    version: v.version,
    createdAt: v.createdAt,
    ...(v.notes != null ? { notes: v.notes } : {}),
    imageUrl: imageUrl(card.id, v.version),
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
    type: "character",
    authorId: card.authorId,
    authorUsername: author?.username ?? null,
    authorAvatar: author?.avatar ?? null,
    slug: card.slug,
    title: card.title,
    latestVersion: card.latestVersion,
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
  const cards = db
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
      versions.find((v) => v.version === card.latestVersion) ??
      versions.reduce<(typeof versions)[number] | undefined>(
        (best, cur) => (!best || cur.version > best.version ? cur : best),
        undefined,
      );

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
      type: "character",
      authorId: card.authorId,
      slug: card.slug,
      title: card.title,
      latestVersion: card.latestVersion,
      versionCount: versions.length || 1,
      imageUrl: imageUrl(card.id, card.latestVersion),
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
    version: number;
    contentHash: string;
    originalPath: string;
    previewPath: string;
  }
> {
  const { authorId, title, slug, fileBytes, notes, dbPath, dataDir } = input;

  const contentHash = sha256Hex(fileBytes);
  const existing = findByHash(contentHash, { dbPath });
  if (existing) {
    throw new DuplicateCardHashError(existing.cardId, existing.version);
  }

  const kc = await parseCharacterCard(fileBytes);

  const cardId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const version = 1;
  const now = new Date().toISOString();

  const resolvedTitle = title?.trim() || kc.name?.trim() || "Untitled";
  const resolvedSlug = slug?.trim()
    ? slugify(slug, cardId)
    : slugify(resolvedTitle, cardId);

  const { originalPath, previewPath } = getVersionPaths(cardId, version, dataDir);

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
        authorId,
        slug: resolvedSlug,
        title: resolvedTitle,
        latestVersion: version,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    tx.insert(characterCardVersions)
      .values({
        id: versionId,
        cardId,
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

  const detail = await getCard(cardId, { dbPath, dataDir });
  return {
    ...detail!,
    cardId,
    version,
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
    version: number;
    contentHash: string;
    originalPath: string;
    previewPath: string;
  }
> {
  const { cardId, authorId, fileBytes, notes, dbPath, dataDir } = input;
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
    throw new DuplicateCardHashError(existing.cardId, existing.version);
  }

  const kc = await parseCharacterCard(fileBytes);

  const nextVersion = card.latestVersion + 1;
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { originalPath, previewPath } = getVersionPaths(
    cardId,
    nextVersion,
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
        version: nextVersion,
        notes: notes ?? null,
        contentHash,
        originalPath,
        previewPath,
        summaryJson,
        createdAt: now,
      })
      .run();

    tx.update(characterCards)
      .set({
        latestVersion: nextVersion,
        updatedAt: now,
      })
      .where(eq(characterCards.id, cardId))
      .run();
  });

  const detail = await getCard(cardId, { dbPath, dataDir });
  return {
    ...detail!,
    cardId,
    version: nextVersion,
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
            eq(characterCardVersions.version, card.latestVersion),
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
  version: number,
  options?: CardServiceOptions & { original?: boolean },
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const db = getDb(options?.dbPath);
  const row = db
    .select()
    .from(characterCardVersions)
    .where(
      and(
        eq(characterCardVersions.cardId, cardId),
        eq(characterCardVersions.version, version),
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
      version: number,
      opts?: { original?: boolean },
    ) => getVersionImage(cardId, version, { ...options, ...opts }),
  };
}
