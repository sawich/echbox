import {
  getContentBlobBytes,
  putContentBlob,
  type TelegramTransport,
} from "./blob-store";
import { ProxyConfigError } from "./errors";
import {
  createBotApiTransport,
  getTelegramBotToken,
  getTelegramChannelId,
} from "./telegram";

export type ContentBlobOptions = {
  dbPath?: string;
  dataDir?: string;
  transport?: TelegramTransport;
  telegramChatId?: string;
};

let testBlobDefaults: {
  transport: TelegramTransport;
  chatId: string;
} | null = null;

/** Test-only: default transport when options omit `transport`. */
export function setContentBlobTestDefaults(
  defaults: { transport: TelegramTransport; chatId: string } | null,
): void {
  testBlobDefaults = defaults;
}

function resolveTransportAndChat(
  options?: ContentBlobOptions,
): { transport: TelegramTransport; chatId: string } {
  if (options?.transport) {
    const chatId = options.telegramChatId?.trim();
    if (!chatId) {
      throw new ProxyConfigError("telegramChatId is required when transport is set");
    }
    return { transport: options.transport, chatId };
  }
  if (testBlobDefaults) {
    return testBlobDefaults;
  }
  return {
    transport: createBotApiTransport(getTelegramBotToken()),
    chatId: getTelegramChannelId(),
  };
}

export async function storeContentOriginal(
  contentHash: string,
  original: Uint8Array,
  options?: ContentBlobOptions,
): Promise<void> {
  const { transport, chatId } = resolveTransportAndChat(options);
  await putContentBlob({
    contentHash,
    original,
    dbPath: options?.dbPath,
    dataDir: options?.dataDir,
    transport,
    chatId,
  });
}

export async function loadContentOriginal(
  contentHash: string,
  legacyOriginalPath: string | null | undefined,
  options?: ContentBlobOptions,
): Promise<Uint8Array | null> {
  const { transport } = resolveTransportAndChat(options);
  const fromBlob = await getContentBlobBytes(contentHash, {
    dbPath: options?.dbPath,
    dataDir: options?.dataDir,
    transport,
  });
  if (fromBlob) {
    return fromBlob;
  }
  if (legacyOriginalPath) {
    const file = Bun.file(legacyOriginalPath);
    if (await file.exists()) {
      return new Uint8Array(await file.arrayBuffer());
    }
  }
  return null;
}
