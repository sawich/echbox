import { uuidv7 } from "uuidv7";

/** Time-ordered unique id for content and version rows. */
export function newId(): string {
  return uuidv7();
}
