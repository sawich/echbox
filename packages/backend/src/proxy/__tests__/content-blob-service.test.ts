import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sha256Hex } from "../../cards/hash";
import { migrateDb } from "../../db/migrate";
import { createFakeTransport } from "./helpers";
import {
  loadContentOriginal,
  setContentBlobTestDefaults,
} from "../content-blob-service";

describe("content blob service", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "echbox-blob-svc-legacy-"));
    dbPath = join(dir, "test.db");
  });

  afterEach(() => {
    setContentBlobTestDefaults({
      transport: createFakeTransport(),
      chatId: "-100999",
    });
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHANNEL_ID;
    rmSync(dir, { recursive: true, force: true });
  });

  test("legacy disk read works with no telegram env or transport", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHANNEL_ID;
    setContentBlobTestDefaults(null);

    migrateDb(dbPath);

    const bytes = new TextEncoder().encode("legacy without telegram");
    const legacyPath = join(dir, "original.bin");
    await Bun.write(legacyPath, bytes);
    const contentHash = sha256Hex(bytes);

    const loaded = await loadContentOriginal(contentHash, legacyPath, {
      dbPath,
      dataDir: join(dir, "data"),
    });

    expect(loaded).toEqual(bytes);
  });
});
