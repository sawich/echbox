import { asc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  contentBlobChunks,
  contentBlobs,
} from "../db/schema";
import { packOriginal, splitChunks, unpackOriginal } from "./archive";
import { withProxyTempDir } from "./temp";
import type { TelegramTransport } from "./telegram";

export type { TelegramTransport } from "./telegram";

function chunkFilename(contentHash: string, chunkIndex: number): string {
  return `${contentHash}.${chunkIndex}.zip.part`;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

export function findContentBlob(
  contentHash: string,
  dbPath?: string,
): { chunkCount: number } | null {
  const db = getDb(dbPath);
  const row = db
    .select({ chunkCount: contentBlobs.chunkCount })
    .from(contentBlobs)
    .where(eq(contentBlobs.contentHash, contentHash))
    .get();
  if (!row) {
    return null;
  }
  return { chunkCount: row.chunkCount };
}

export async function putContentBlob(input: {
  contentHash: string;
  original: Uint8Array;
  dbPath?: string;
  dataDir?: string;
  transport: TelegramTransport;
  chatId: string;
}): Promise<void> {
  const db = getDb(input.dbPath);
  const existing = findContentBlob(input.contentHash, input.dbPath);
  if (existing) {
    return;
  }

  const archive = packOriginal(input.original);
  const chunks = splitChunks(archive);
  const uploaded: {
    chunkIndex: number;
    byteSize: number;
    fileId: string;
    messageId: string;
  }[] = [];

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const bytes = chunks[chunkIndex]!;
    const { fileId, messageId } = await input.transport.sendDocument(
      input.chatId,
      bytes,
      chunkFilename(input.contentHash, chunkIndex),
    );
    uploaded.push({
      chunkIndex,
      byteSize: bytes.length,
      fileId,
      messageId,
    });
  }

  const createdAt = new Date().toISOString();
  db.transaction((tx) => {
    tx.insert(contentBlobs)
      .values({
        contentHash: input.contentHash,
        originalByteSize: input.original.length,
        archiveByteSize: archive.length,
        chunkCount: chunks.length,
        createdAt,
      })
      .run();

    tx.insert(contentBlobChunks)
      .values(
        uploaded.map((chunk) => ({
          contentHash: input.contentHash,
          chunkIndex: chunk.chunkIndex,
          byteSize: chunk.byteSize,
          telegramFileId: chunk.fileId,
          telegramMessageId: chunk.messageId,
          telegramChatId: input.chatId,
        })),
      )
      .run();
  });
}

export async function getContentBlobBytes(
  contentHash: string,
  options: {
    dbPath?: string;
    dataDir?: string;
    transport: TelegramTransport;
  },
): Promise<Uint8Array | null> {
  const db = getDb(options.dbPath);
  const blob = db
    .select()
    .from(contentBlobs)
    .where(eq(contentBlobs.contentHash, contentHash))
    .get();
  if (!blob) {
    return null;
  }

  const chunkRows = db
    .select()
    .from(contentBlobChunks)
    .where(eq(contentBlobChunks.contentHash, contentHash))
    .orderBy(asc(contentBlobChunks.chunkIndex))
    .all();

  return withProxyTempDir(async () => {
    const parts: Uint8Array[] = [];
    for (const row of chunkRows) {
      parts.push(await options.transport.downloadFile(row.telegramFileId));
    }
    const archive = concatBytes(parts);
    return unpackOriginal(archive);
  }, options.dataDir);
}
