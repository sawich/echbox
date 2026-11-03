import type { ContentKind } from "@echbox/shared";
import { createGame } from "../games/service";

const ALL_KINDS: ContentKind[] = [
  "cards",
  "clothes",
  "scenes",
  "plugins",
  "softmods",
];

/** Create a game row for content tests (no admin check). Enables all kinds. */
export function seedTestGame(
  createdByUserId: string,
  options?: { dbPath?: string; title?: string },
) {
  return createGame({
    title: options?.title ?? "Test Game",
    createdByUserId,
    dbPath: options?.dbPath,
    contentKinds: ALL_KINDS.map((kind) => ({ kind, relPath: null })),
  });
}
