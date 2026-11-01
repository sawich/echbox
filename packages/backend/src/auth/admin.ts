import type { User } from "./session";

export function adminDiscordIds(): Set<string> {
  const raw =
    Bun.env.ADMIN_DISCORD_IDS ?? process.env.ADMIN_DISCORD_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isAdmin(user: Pick<User, "discordId"> | null | undefined): boolean {
  if (!user?.discordId) return false;
  return adminDiscordIds().has(user.discordId);
}
