import { resolve, sep } from "node:path";

/**
 * Sideloader-style identifier: starts with an alphanumeric, then
 * alphanumerics, dots, hyphens and underscores. No separators, no `..`.
 */
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isSafeStorageId(id: string): boolean {
  return SAFE_ID_RE.test(id) && !id.includes("..");
}

/**
 * Resolves `target` and asserts it is strictly inside `root`
 * (never equal to root itself). Returns the resolved target path.
 */
export function resolveWithin(root: string, target: string): string {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  if (!resolvedTarget.startsWith(resolvedRoot + sep)) {
    throw new Error("Path escapes storage root");
  }
  return resolvedTarget;
}
