import { Discord, generateCodeVerifier, generateState } from "arctic";

export interface DiscordProfile {
  id: string;
  username: string;
  global_name?: string | null;
  avatar: string | null;
}

export function getDiscordClient(): Discord {
  const clientId =
    Bun.env.DISCORD_CLIENT_ID ?? process.env.DISCORD_CLIENT_ID ?? "";
  const clientSecret =
    Bun.env.DISCORD_CLIENT_SECRET ?? process.env.DISCORD_CLIENT_SECRET ?? null;
  const redirectUri =
    Bun.env.DISCORD_REDIRECT_URI ??
    process.env.DISCORD_REDIRECT_URI ??
    "http://localhost:3001/api/auth/discord/callback";

  return new Discord(clientId, clientSecret, redirectUri);
}

export function createDiscordAuthUrl(): {
  url: URL;
  state: string;
  codeVerifier: string;
} {
  const discord = getDiscordClient();
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = discord.createAuthorizationURL(state, codeVerifier, ["identify"]);
  return { url, state, codeVerifier };
}

export async function exchangeDiscordCodeForUser(
  code: string,
  codeVerifier: string | null,
): Promise<{
  discordId: string;
  username: string;
  avatar: string | null;
}> {
  const discord = getDiscordClient();
  const tokens = await discord.validateAuthorizationCode(code, codeVerifier);
  const accessToken = tokens.accessToken();

  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Discord user fetch failed with status ${res.status}`);
  }

  const profile = (await res.json()) as DiscordProfile;
  const avatarUrl = profile.avatar
    ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
    : null;

  return {
    discordId: profile.id,
    username: profile.global_name || profile.username,
    avatar: avatarUrl,
  };
}
