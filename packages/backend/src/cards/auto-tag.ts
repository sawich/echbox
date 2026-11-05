import { eq } from "drizzle-orm";
import { basename } from "node:path";
import { getDb } from "../db/client";
import { characterCards, characterCardVersions } from "../db/schema";
import { ensureEchboxUser } from "../scenes/import-seed";
import {
  ensureGeneralTag,
  getContentTags,
  setContentTags,
} from "../tags/service";

export function parseBooruTagString(raw: string): string[] {
  return raw
    .split(",")
    .map((part) =>
      part
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, ""),
    )
    .filter((part) => part.length > 0 && /^[a-z0-9_]+$/.test(part));
}

export function buildTaggerWorkflow(
  template: Record<string, unknown>,
  imageName: string,
): Record<string, unknown> {
  const workflow = structuredClone(template) as Record<string, unknown>;
  const node = workflow["2"];
  if (!node || typeof node !== "object") {
    throw new Error('Workflow missing LoadImage node "2"');
  }
  const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
  if (!inputs || typeof inputs !== "object") {
    throw new Error('LoadImage node "2" missing inputs');
  }
  inputs.image = imageName;
  return workflow;
}

export type HistoryOutputNode = {
  text?: string[];
  ui?: { text?: string[] };
};

export type HistoryEntry = {
  outputs?: Record<string, HistoryOutputNode>;
};

function textFromNode(node: HistoryOutputNode | undefined): string | null {
  if (!node) return null;
  const parts = node.text ?? node.ui?.text;
  if (!parts || parts.length === 0) return null;
  const joined = parts.map((p) => p.trim()).filter(Boolean).join(", ");
  return joined.length > 0 ? joined : null;
}

const PREVIEW_NODES = ["13", "14", "15", "16"] as const;

export function extractTagStringFromHistory(
  entry: HistoryEntry,
): string | null {
  const outputs = entry.outputs;
  if (!outputs) return null;

  const fromTagger = textFromNode(outputs["8"]);
  if (fromTagger) return fromTagger;

  for (const id of PREVIEW_NODES) {
    const fromPreview = textFromNode(outputs[id]);
    if (fromPreview) return fromPreview;
  }
  return null;
}

export type ComfyClient = {
  uploadImage(path: string): Promise<string>;
  runWorkflow(workflow: Record<string, unknown>): Promise<HistoryEntry>;
};

export type AutoTagResult = {
  tagged: number;
  skipped: number;
  failed: number;
  failures: { cardId: string; error: string }[];
};

export type AutoTagCardsOptions = {
  dbPath?: string;
  dataDir?: string;
  comfy: ComfyClient;
  workflow: Record<string, unknown>;
  dryRun?: boolean;
  limit?: number;
  force?: boolean;
  userId?: string;
};

const DEFAULT_POLL_MS = 500;
const DEFAULT_TIMEOUT_MS = 120_000;

export function createComfyClient(
  baseUrl: string,
  options?: { pollMs?: number; timeoutMs?: number },
): ComfyClient {
  const root = baseUrl.replace(/\/$/, "");
  const pollMs = options?.pollMs ?? DEFAULT_POLL_MS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async uploadImage(path: string): Promise<string> {
      const file = Bun.file(path);
      if (!(await file.exists())) {
        throw new Error(`Preview missing: ${path}`);
      }
      const form = new FormData();
      form.append("image", file, basename(path));
      const res = await fetch(`${root}/upload/image`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        throw new Error(`Comfy upload failed (${res.status})`);
      }
      const body = (await res.json()) as { name?: string };
      if (!body.name) {
        throw new Error("Comfy upload response missing name");
      }
      return body.name;
    },

    async runWorkflow(
      workflow: Record<string, unknown>,
    ): Promise<HistoryEntry> {
      const promptRes = await fetch(`${root}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: workflow }),
      });
      if (!promptRes.ok) {
        throw new Error(`Comfy prompt failed (${promptRes.status})`);
      }
      const promptBody = (await promptRes.json()) as { prompt_id?: string };
      const promptId = promptBody.prompt_id;
      if (!promptId) {
        throw new Error("Comfy prompt response missing prompt_id");
      }

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const histRes = await fetch(`${root}/history/${promptId}`);
        if (!histRes.ok) {
          throw new Error(`Comfy history failed (${histRes.status})`);
        }
        const histBody = (await histRes.json()) as Record<
          string,
          HistoryEntry
        >;
        const entry = histBody[promptId];
        if (entry?.outputs && Object.keys(entry.outputs).length > 0) {
          return entry;
        }
        await Bun.sleep(pollMs);
      }
      throw new Error(`Comfy history timeout for ${promptId}`);
    },
  };
}

type CardRow = {
  id: string;
  uploaderId: string;
  previewPath: string;
};

function listCardsWithPreview(dbPath?: string): CardRow[] {
  const db = getDb(dbPath);
  const cards = db.select().from(characterCards).all();
  const rows: CardRow[] = [];
  for (const card of cards) {
    if (!card.latestVersionId) continue;
    const version = db
      .select()
      .from(characterCardVersions)
      .where(eq(characterCardVersions.id, card.latestVersionId))
      .get();
    if (!version?.previewPath) continue;
    rows.push({
      id: card.id,
      uploaderId: card.uploaderId,
      previewPath: version.previewPath,
    });
  }
  return rows;
}

export async function autoTagCards(
  options: AutoTagCardsOptions,
): Promise<AutoTagResult> {
  const userId = options.userId ?? ensureEchboxUser(options.dbPath).id;
  const actor = { userId, isAdmin: true as const };
  const result: AutoTagResult = {
    tagged: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  let cards = listCardsWithPreview(options.dbPath);
  if (options.limit != null && options.limit >= 0) {
    cards = cards.slice(0, options.limit);
  }

  for (const card of cards) {
    try {
      if (!options.force) {
        const existing = getContentTags({
          kind: "cards",
          contentId: card.id,
          dbPath: options.dbPath,
        });
        if (existing.length > 0) {
          result.skipped += 1;
          continue;
        }
      }

      const preview = Bun.file(card.previewPath);
      if (!(await preview.exists())) {
        throw new Error(`Preview missing: ${card.previewPath}`);
      }

      const imageName = await options.comfy.uploadImage(card.previewPath);
      const prompt = buildTaggerWorkflow(options.workflow, imageName);
      const history = await options.comfy.runWorkflow(prompt);
      const raw = extractTagStringFromHistory(history);
      if (!raw) {
        throw new Error("No tag string in Comfy history");
      }
      const names = parseBooruTagString(raw);
      if (names.length === 0) {
        throw new Error("Empty tag list from Comfy");
      }

      if (!options.dryRun) {
        for (const name of names) {
          ensureGeneralTag(name, actor, options.dbPath);
        }
        setContentTags({
          kind: "cards",
          contentId: card.id,
          names,
          actor,
          uploaderId: card.uploaderId,
          dbPath: options.dbPath,
        });
      }

      result.tagged += 1;
    } catch (err) {
      result.failed += 1;
      result.failures.push({
        cardId: card.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
