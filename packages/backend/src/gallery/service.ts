import type { CardDetail, CardListItem, CardType } from "@echbox/shared";
import { KoikatuCharaData, KoikatuSceneData } from "../kkloader";
import { loadSeed, resolveFixture, type SeedCard, type SeedVersion } from "./seed";

type CachedPayload = {
  summary: Record<string, unknown>;
  imageBytes: Uint8Array;
  displayName: string | null;
};

function imageUrl(cardId: string, version: number): string {
  return `/api/kk/cards/${cardId}/versions/${version}/image`;
}

async function parseFixture(
  type: CardType,
  fixtureRel: string,
): Promise<CachedPayload> {
  const path = resolveFixture(fixtureRel);
  if (type === "character") {
    const kc = await KoikatuCharaData.load(path);
    let imageBytes = kc.image ?? kc.faceImage;
    if (!imageBytes || imageBytes.byteLength === 0) {
      imageBytes = new Uint8Array(await Bun.file(path).arrayBuffer());
    }
    return {
      summary: kc.summary() as unknown as Record<string, unknown>,
      imageBytes,
      displayName: kc.name || null,
    };
  }
  const scene = await KoikatuSceneData.load(path);
  let imageBytes = scene.image;
  if (!imageBytes || imageBytes.byteLength === 0) {
    imageBytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  }
  return {
    summary: scene.summary() as unknown as Record<string, unknown>,
    imageBytes,
    displayName: null,
  };
}

export function createGalleryService() {
  const seed = loadSeed();
  const byId = new Map(seed.map((c) => [c.id, c]));
  const cache = new Map<string, Promise<CachedPayload>>();

  function cached(type: CardType, fixture: string): Promise<CachedPayload> {
    const key = `${type}:${fixture}`;
    let hit = cache.get(key);
    if (!hit) {
      hit = parseFixture(type, fixture).catch((err) => {
        cache.delete(key);
        throw err;
      });
      cache.set(key, hit);
    }
    return hit;
  }

  function latestVersion(card: SeedCard): SeedVersion {
    return card.versions.reduce((a, b) => (a.version >= b.version ? a : b));
  }

  async function resolveTitle(card: SeedCard): Promise<string> {
    if (card.title) return card.title;
    const latest = latestVersion(card);
    const payload = await cached(card.type, latest.fixture);
    if (payload.displayName?.trim()) return payload.displayName.trim();
    return card.slug;
  }

  async function listCards(type?: CardType): Promise<CardListItem[]> {
    const cards = type ? seed.filter((c) => c.type === type) : seed;
    const out: CardListItem[] = [];
    for (const card of cards) {
      const latest = latestVersion(card);
      const payload = await cached(card.type, latest.fixture);
      out.push({
        id: card.id,
        type: card.type,
        slug: card.slug,
        title: await resolveTitle(card),
        latestVersion: latest.version,
        versionCount: card.versions.length,
        imageUrl: imageUrl(card.id, latest.version),
        summary: payload.summary,
      });
    }
    return out;
  }

  async function getCard(id: string): Promise<CardDetail | null> {
    const card = byId.get(id);
    if (!card) return null;
    const title = await resolveTitle(card);
    const versions = [];
    for (const ver of [...card.versions].sort((a, b) => a.version - b.version)) {
      const payload = await cached(card.type, ver.fixture);
      versions.push({
        version: ver.version,
        createdAt: ver.createdAt,
        notes: ver.notes,
        imageUrl: imageUrl(card.id, ver.version),
        summary: payload.summary,
      });
    }
    return {
      id: card.id,
      type: card.type,
      slug: card.slug,
      title,
      latestVersion: latestVersion(card).version,
      versions,
    };
  }

  async function getVersionImage(
    id: string,
    version: number,
  ): Promise<Uint8Array | null> {
    const card = byId.get(id);
    if (!card) return null;
    const ver = card.versions.find((v) => v.version === version);
    if (!ver) return null;
    const payload = await cached(card.type, ver.fixture);
    return payload.imageBytes;
  }

  return { listCards, getCard, getVersionImage };
}
