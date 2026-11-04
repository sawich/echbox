import { ProxyConfigError } from "./errors";

export type TelegramTransport = {
  sendDocument(
    chatId: string,
    bytes: Uint8Array,
    filename: string,
  ): Promise<{ fileId: string; messageId: string }>;
  downloadFile(fileId: string): Promise<Uint8Array>;
};

export function getTelegramBotToken(): string {
  const token = Bun.env.TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token?.trim()) {
    throw new ProxyConfigError("TELEGRAM_BOT_TOKEN is not set");
  }
  return token.trim();
}

export function getTelegramChannelId(): string {
  const chatId =
    Bun.env.TELEGRAM_CHANNEL_ID ?? process.env.TELEGRAM_CHANNEL_ID;
  if (!chatId?.trim()) {
    throw new ProxyConfigError("TELEGRAM_CHANNEL_ID is not set");
  }
  return chatId.trim();
}

type TelegramApiResponse<T> = {
  ok: boolean;
  description?: string;
  result?: T;
};

export function createBotApiTransport(token: string): TelegramTransport {
  const apiBase = `https://api.telegram.org/bot${token}`;

  return {
    async sendDocument(chatId, bytes, filename) {
      const form = new FormData();
      form.append("chat_id", chatId);
      form.append("document", new Blob([bytes]), filename);

      const res = await fetch(`${apiBase}/sendDocument`, {
        method: "POST",
        body: form,
      });
      const body = (await res.json()) as TelegramApiResponse<{
        message_id: number;
        document: { file_id: string };
      }>;
      if (!res.ok || !body.ok || !body.result) {
        throw new Error(
          body.description ?? `sendDocument failed (${res.status})`,
        );
      }
      return {
        fileId: body.result.document.file_id,
        messageId: String(body.result.message_id),
      };
    },

    async downloadFile(fileId) {
      const metaRes = await fetch(
        `${apiBase}/getFile?file_id=${encodeURIComponent(fileId)}`,
      );
      const meta = (await metaRes.json()) as TelegramApiResponse<{
        file_path: string;
      }>;
      if (!metaRes.ok || !meta.ok || !meta.result?.file_path) {
        throw new Error(
          meta.description ?? `getFile failed (${metaRes.status})`,
        );
      }

      const fileRes = await fetch(
        `https://api.telegram.org/file/bot${token}/${meta.result.file_path}`,
      );
      if (!fileRes.ok) {
        throw new Error(`file download failed (${fileRes.status})`);
      }
      return new Uint8Array(await fileRes.arrayBuffer());
    },
  };
}
