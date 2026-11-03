import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CardType } from "@echbox/shared";
import seedJson from "./seed.json";

export type SeedVersion = {
  version: number;
  /** Optional explicit semver; defaults to `${version}.0.0`. */
  semver?: string;
  createdAt: string;
  fixture: string;
  notes?: string;
};

export type SeedCard = {
  id: string;
  type: CardType;
  slug: string;
  title: string | null;
  versions: SeedVersion[];
};

export function seedVersionSemver(ver: SeedVersion): string {
  return ver.semver ?? `${ver.version}.0.0`;
}

const FIXTURES_ROOT = join(import.meta.dir, "../../fixtures");

export function fixturesRoot(): string {
  return FIXTURES_ROOT;
}

export function resolveFixture(relative: string): string {
  const path = join(FIXTURES_ROOT, relative);
  if (!existsSync(path)) {
    throw new Error(`Missing gallery fixture: ${path}`);
  }
  return path;
}

export function loadSeed(): SeedCard[] {
  const cards = seedJson as SeedCard[];
  for (const card of cards) {
    if (!card.versions.length) {
      throw new Error(`Seed card ${card.id} has no versions`);
    }
    for (const ver of card.versions) {
      resolveFixture(ver.fixture);
    }
  }
  return cards;
}
