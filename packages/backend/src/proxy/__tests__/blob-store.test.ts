import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CHUNK_SIZE_BYTES } from "../archive";
import {
  findContentBlob,
  getContentBlobBytes,
  putContentBlob,
  type TelegramTransport,
} from "../blob-store";
import { migrateDb } from "../../db/migrate";

function createFakeTransport(options?: {
  failOnChunkIndex?: number;
}): TelegramTransport & { sendCount: number } {
  const files = new Map<string, Uint8Array>();
  let nextMessageId = 1;
  let sendCount = 0;

  const transport: TelegramTransport & { sendCount: number } = {
    sendCount: 0,
    async sendDocument(_chatId, bytes, _filename) {
      sendCount += 1;
      const chunkMatch = _filename.match(/\.(\d+)\.zip\.part$/);
      const chunkIndex = chunkMatch ? Number(chunkMatch[1]) : -1;
      if (options?.failOnChunkIndex === chunkIndex) {
        throw new Error(`simulated upload failure on chunk ${chunkIndex}`);
      }
      const fileId = `file-${files.size}`;
      files.set(fileId, bytes);
      const messageId = String(nextMessageId++);
      return { fileId, messageId };
    },
    async downloadFile(fileId) {
      const bytes = files.get(fileId);
      if (!bytes) {
        throw new Error(`unknown fileId ${fileId}`);
      }
      return bytes;
    },
  };

  Object.defineProperty(transport, "sendCount", {
    get() {
      return sendCount;
    },
  });

  return transport;
}

describe("content blob store", () => {
  let dir: string;
  let dbPath: string;
  let dataDir: string;
  const chatId = "-100999";

  function incompressibleOriginal(byteLength: number): Uint8Array {
    const original = new Uint8Array(byteLength);
    crypto.getRandomValues(original);
    return original;
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "echbox-blob-store-"));
    dbPath = join(dir, "test.db");
    dataDir = join(dir, "data");
    migrateDb(dbPath);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("put then get round-trips original", async () => {
    const original = new TextEncoder().encode("blob store round trip");
    const contentHash = "a".repeat(64);
    const transport = createFakeTransport();

    await putContentBlob({
      contentHash,
      original,
      dbPath,
      dataDir,
      transport,
      chatId,
    });

    const got = await getContentBlobBytes(contentHash, {
      dbPath,
      dataDir,
      transport,
    });
    expect(got).toEqual(original);
  });

  test("put of same hash is idempotent (transport send count unchanged on second put)", async () => {
    const original = new TextEncoder().encode("idempotent");
    const contentHash = "b".repeat(64);
    const transport = createFakeTransport();

    await putContentBlob({
      contentHash,
      original,
      dbPath,
      dataDir,
      transport,
      chatId,
    });
    const sendsAfterFirst = transport.sendCount;

    await putContentBlob({
      contentHash,
      original,
      dbPath,
      dataDir,
      transport,
      chatId,
    });

    expect(transport.sendCount).toBe(sendsAfterFirst);
  });

  test("archive requiring 2 chunks stores chunk_count === 2 and get still round-trips", async () => {
    const original = incompressibleOriginal(CHUNK_SIZE_BYTES + 4096);
    const contentHash = "c".repeat(64);
    const transport = createFakeTransport();

    await putContentBlob({
      contentHash,
      original,
      dbPath,
      dataDir,
      transport,
      chatId,
    });

    expect(findContentBlob(contentHash, dbPath)).toEqual({ chunkCount: 2 });

    const got = await getContentBlobBytes(contentHash, {
      dbPath,
      dataDir,
      transport,
    });
    expect(got).toEqual(original);
  });

  test("concurrent put of same new hash completes without throw", async () => {
    const original = new TextEncoder().encode("race");
    const contentHash = "e".repeat(64);
    const transport = createFakeTransport();

    await Promise.all([
      putContentBlob({
        contentHash,
        original,
        dbPath,
        dataDir,
        transport,
        chatId,
      }),
      putContentBlob({
        contentHash,
        original,
        dbPath,
        dataDir,
        transport,
        chatId,
      }),
    ]);

    expect(findContentBlob(contentHash, dbPath)).toEqual({ chunkCount: 1 });
  });

  test("get writes each chunk to a part file in temp dir", async () => {
    const original = incompressibleOriginal(CHUNK_SIZE_BYTES + 4096);
    const contentHash = "f".repeat(64);
    const transport = createFakeTransport();

    await putContentBlob({
      contentHash,
      original,
      dbPath,
      dataDir,
      transport,
      chatId,
    });

    const writtenPaths: string[] = [];
    const origWrite = Bun.write.bind(Bun);
    Bun.write = (async (path, data) => {
      writtenPaths.push(String(path));
      return origWrite(path, data);
    }) as typeof Bun.write;

    try {
      const got = await getContentBlobBytes(contentHash, {
        dbPath,
        dataDir,
        transport,
      });
      expect(got).toEqual(original);
    } finally {
      Bun.write = origWrite;
    }

    expect(writtenPaths.some((p) => p.endsWith("chunk-0.part"))).toBe(true);
    expect(writtenPaths.some((p) => p.endsWith("chunk-1.part"))).toBe(true);
  });

  test("if sendDocument throws on chunk 2, findContentBlob is null", async () => {
    const original = incompressibleOriginal(CHUNK_SIZE_BYTES + 4096);
    const contentHash = "d".repeat(64);
    const transport = createFakeTransport({ failOnChunkIndex: 1 });

    await expect(
      putContentBlob({
        contentHash,
        original,
        dbPath,
        dataDir,
        transport,
        chatId,
      }),
    ).rejects.toThrow(/chunk 1/);

    expect(findContentBlob(contentHash, dbPath)).toBeNull();
  });
});
