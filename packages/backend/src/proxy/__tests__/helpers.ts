import type { TelegramTransport } from "../blob-store";

export function createFakeTransport(options?: {
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
