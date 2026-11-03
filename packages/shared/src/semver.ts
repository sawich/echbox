import semver from "semver";
import { z } from "zod";

/** Canonicalize and validate a semver string. Throws if invalid. */
export function parseSemver(input: string): string {
  const trimmed = input.trim();
  const coerced = semver.valid(trimmed) ?? semver.valid(semver.coerce(trimmed));
  if (!coerced) {
    throw new Error(`Invalid semver: ${input}`);
  }
  // Prefer the trimmed form if it was already valid; otherwise use coerced.
  return semver.valid(trimmed) ?? coerced;
}

export function isValidSemver(input: string): boolean {
  try {
    parseSemver(input);
    return true;
  } catch {
    return false;
  }
}

export function compareSemver(a: string, b: string): number {
  return semver.compare(parseSemver(a), parseSemver(b));
}

/** Pick the version row with the highest semver. */
export function pickLatestBySemver<T extends { semver: string }>(
  rows: T[],
): T | null {
  if (rows.length === 0) return null;
  let best = rows[0]!;
  for (let i = 1; i < rows.length; i++) {
    const cur = rows[i]!;
    if (compareSemver(cur.semver, best.semver) > 0) best = cur;
  }
  return best;
}

export const SemverSchema = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    try {
      return parseSemver(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Invalid semver",
      });
      return z.NEVER;
    }
  });
