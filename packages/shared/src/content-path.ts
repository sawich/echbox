import { z } from "zod";
import {
  ContentKindSchema,
  type ContentKind,
  type GameContentKind,
} from "./schemas/games";

export class BadContentPathError extends Error {
  readonly code = "bad_content_kinds" as const;
  constructor(message: string) {
    super(message);
    this.name = "BadContentPathError";
  }
}

export function normalizeContentRelPath(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\")) {
    throw new BadContentPathError("Content path must be relative");
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("~")) {
    throw new BadContentPathError("Content path must be relative");
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/\/+/g, "/");
  const segments = normalized.split("/").filter((s) => s.length > 0);
  if (segments.some((s) => s === "..")) {
    throw new BadContentPathError("Content path must not contain '..'");
  }
  if (segments.some((s) => s === ".")) {
    // drop "." segments by filtering
  }
  const cleaned = segments.filter((s) => s !== ".");
  if (cleaned.length === 0) return null;
  return cleaned.join("/");
}

const InputKindSchema = z.object({
  kind: ContentKindSchema,
  relPath: z.string().nullable().optional(),
});

export function parseContentKindsInput(raw: unknown): GameContentKind[] {
  const parsed = z.array(InputKindSchema).safeParse(raw);
  if (!parsed.success) {
    throw new BadContentPathError("Invalid contentKinds payload");
  }

  const seen = new Set<ContentKind>();
  const out: GameContentKind[] = [];
  for (const row of parsed.data) {
    if (seen.has(row.kind)) {
      throw new BadContentPathError(`Duplicate content kind: ${row.kind}`);
    }
    seen.add(row.kind);
    out.push({
      kind: row.kind,
      relPath: normalizeContentRelPath(row.relPath ?? null),
    });
  }
  return out;
}
