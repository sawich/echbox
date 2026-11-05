import { rm } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { isSafeStorageId } from "../common/safe-path";
import { writeWebpPreviewFit } from "../cards/preview";
import { getDb } from "../db/client";
import { softmodPreviews, softmods } from "../db/schema";
import { newId } from "../id";
import {
  BadSoftmodError,
  ForbiddenSoftmodError,
  SoftmodNotFoundError,
} from "./errors";
import { assertSafeSoftmodId, getSoftmodDir, removePlacedFile } from "./storage";

export const SOFTMOD_PREVIEW_LIMIT = 3;
export const SOFTMOD_PREVIEW_MAX_WIDTH = 1280;
export const SOFTMOD_PREVIEW_MAX_HEIGHT = 720;

const PREVIEW_LIMIT_MESSAGE = "A softmod can have at most 3 preview images.";

export type SoftmodPreviewActor = {
  userId: string;
  isAdmin: boolean;
};

export type SoftmodPreview = {
  id: string;
  sortIndex: number;
  url: string;
};

type PreviewScope = {
  dbPath?: string;
  dataDir?: string;
};

export function softmodPreviewUrl(softmodId: string, previewId: string): string {
  return `/api/softmods/${softmodId}/previews/${previewId}`;
}

export function softmodPreviewPath(
  softmodId: string,
  previewId: string,
  dataDir?: string,
): string {
  assertSafeSoftmodId(softmodId);
  if (!isSafeStorageId(previewId)) {
    throw new BadSoftmodError("Invalid preview id");
  }
  return join(getSoftmodDir(softmodId, dataDir), "previews", `${previewId}.webp`);
}

function requireOwnedSoftmod(
  softmodId: string,
  uploaderId: string,
  actor: SoftmodPreviewActor,
  dbPath?: string,
) {
  const softmod = getDb(dbPath)
    .select()
    .from(softmods)
    .where(eq(softmods.id, softmodId))
    .get();

  if (!softmod) {
    throw new SoftmodNotFoundError();
  }
  if (softmod.uploaderId !== uploaderId) {
    throw new ForbiddenSoftmodError();
  }
  if (actor.userId !== softmod.uploaderId && !actor.isAdmin) {
    throw new ForbiddenSoftmodError(
      "Only the uploader can change softmod previews.",
    );
  }
  return softmod;
}

export function listSoftmodPreviews(
  softmodId: string,
  options?: Pick<PreviewScope, "dbPath">,
): SoftmodPreview[] {
  const rows = getDb(options?.dbPath)
    .select()
    .from(softmodPreviews)
    .where(eq(softmodPreviews.softmodId, softmodId))
    .orderBy(asc(softmodPreviews.sortIndex))
    .all();

  return rows.map((row) => ({
    id: row.id,
    sortIndex: row.sortIndex,
    url: softmodPreviewUrl(softmodId, row.id),
  }));
}

export function previewUrlsBySoftmodId(
  softmodIds: string[],
  options?: Pick<PreviewScope, "dbPath">,
): Map<string, string[]> {
  const urls = new Map<string, string[]>();
  if (softmodIds.length === 0) return urls;

  const rows = getDb(options?.dbPath)
    .select()
    .from(softmodPreviews)
    .where(inArray(softmodPreviews.softmodId, softmodIds))
    .orderBy(asc(softmodPreviews.sortIndex))
    .all();

  for (const row of rows) {
    const list = urls.get(row.softmodId) ?? [];
    list.push(softmodPreviewUrl(row.softmodId, row.id));
    urls.set(row.softmodId, list);
  }
  return urls;
}

export async function addSoftmodPreview(
  input: PreviewScope & {
    softmodId: string;
    bytes: Uint8Array;
    actor: SoftmodPreviewActor;
    uploaderId: string;
  },
): Promise<SoftmodPreview> {
  assertSafeSoftmodId(input.softmodId);
  requireOwnedSoftmod(
    input.softmodId,
    input.uploaderId,
    input.actor,
    input.dbPath,
  );

  const db = getDb(input.dbPath);
  const current = db
    .select({ sortIndex: softmodPreviews.sortIndex })
    .from(softmodPreviews)
    .where(eq(softmodPreviews.softmodId, input.softmodId))
    .all();
  if (current.length >= SOFTMOD_PREVIEW_LIMIT) {
    throw new BadSoftmodError(PREVIEW_LIMIT_MESSAGE);
  }

  const id = newId();
  const previewPath = softmodPreviewPath(input.softmodId, id, input.dataDir);
  try {
    await writeWebpPreviewFit(input.bytes, previewPath, {
      maxWidth: SOFTMOD_PREVIEW_MAX_WIDTH,
      maxHeight: SOFTMOD_PREVIEW_MAX_HEIGHT,
    });
  } catch (err) {
    await rm(previewPath, { force: true });
    throw new BadSoftmodError(
      err instanceof Error && err.message
        ? err.message
        : "Preview image could not be read.",
    );
  }

  let sortIndex = current.reduce((max, row) => Math.max(max, row.sortIndex), -1) + 1;
  try {
    db.transaction(
      (tx) => {
        const locked = tx
          .select({ sortIndex: softmodPreviews.sortIndex })
          .from(softmodPreviews)
          .where(eq(softmodPreviews.softmodId, input.softmodId))
          .all();
        if (locked.length >= SOFTMOD_PREVIEW_LIMIT) {
          throw new BadSoftmodError(PREVIEW_LIMIT_MESSAGE);
        }
        sortIndex =
          locked.reduce((max, row) => Math.max(max, row.sortIndex), -1) + 1;
        tx.insert(softmodPreviews)
          .values({
            id,
            softmodId: input.softmodId,
            sortIndex,
            previewPath,
            createdAt: new Date().toISOString(),
          })
          .run();
      },
      { behavior: "immediate" },
    );
  } catch (err) {
    await rm(previewPath, { force: true });
    throw err;
  }

  return {
    id,
    sortIndex,
    url: softmodPreviewUrl(input.softmodId, id),
  };
}

export async function deleteSoftmodPreview(
  input: PreviewScope & {
    softmodId: string;
    previewId: string;
    actor: SoftmodPreviewActor;
    uploaderId: string;
  },
): Promise<void> {
  requireOwnedSoftmod(
    input.softmodId,
    input.uploaderId,
    input.actor,
    input.dbPath,
  );

  const row = getDb(input.dbPath)
    .select()
    .from(softmodPreviews)
    .where(
      and(
        eq(softmodPreviews.id, input.previewId),
        eq(softmodPreviews.softmodId, input.softmodId),
      ),
    )
    .get();

  if (!row) {
    throw new SoftmodNotFoundError("Preview not found");
  }

  getDb(input.dbPath)
    .delete(softmodPreviews)
    .where(eq(softmodPreviews.id, row.id))
    .run();

  await removePlacedFile(row.previewPath, input.dataDir);
}

export async function reorderSoftmodPreviews(
  input: PreviewScope & {
    softmodId: string;
    orderedIds: string[];
    actor: SoftmodPreviewActor;
    uploaderId: string;
  },
): Promise<SoftmodPreview[]> {
  requireOwnedSoftmod(
    input.softmodId,
    input.uploaderId,
    input.actor,
    input.dbPath,
  );

  const db = getDb(input.dbPath);
  db.transaction((tx) => {
    const rows = tx
      .select()
      .from(softmodPreviews)
      .where(eq(softmodPreviews.softmodId, input.softmodId))
      .all();
    const existing = new Set(rows.map((row) => row.id));
    const unique = new Set(input.orderedIds);
    if (
      input.orderedIds.length !== rows.length ||
      unique.size !== input.orderedIds.length ||
      input.orderedIds.some((id) => !existing.has(id))
    ) {
      throw new BadSoftmodError("Preview order must list every preview once.");
    }

    rows.forEach((row, index) => {
      tx.update(softmodPreviews)
        .set({ sortIndex: -(index + 1) })
        .where(eq(softmodPreviews.id, row.id))
        .run();
    });
    input.orderedIds.forEach((id, index) => {
      tx.update(softmodPreviews)
        .set({ sortIndex: index })
        .where(eq(softmodPreviews.id, id))
        .run();
    });
  });

  return listSoftmodPreviews(input.softmodId, { dbPath: input.dbPath });
}
