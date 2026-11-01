import { createGame } from "../games/service";

/** Create a game row for content tests (no admin check). */
export function seedTestGame(
  createdByUserId: string,
  options?: { dbPath?: string; title?: string },
) {
  return createGame({
    title: options?.title ?? "Test Game",
    createdByUserId,
    dbPath: options?.dbPath,
  });
}
