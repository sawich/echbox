import type { TaggableContentKind } from "@echbox/shared";
import { isAdmin } from "../auth/admin";
import type { User } from "../auth/session";
import { getCard } from "../cards/service";
import { getClothes } from "../clothes/service";
import { getScene } from "../scenes/service";
import { getSoftmod } from "../softmods/service";
import { TagServiceError } from "../tags/errors";
import { getContentTags, setContentTags } from "../tags/service";

type StatusSetter = { status?: number | string };

export function handleTagError(err: unknown, set: StatusSetter) {
  if (err instanceof TagServiceError) {
    set.status = err.status;
    return { error: err.message, code: err.code };
  }
  throw err;
}

async function uploaderIdOf(
  kind: TaggableContentKind,
  contentId: string,
): Promise<string | null> {
  switch (kind) {
    case "cards":
      return (await getCard(contentId))?.uploaderId ?? null;
    case "scenes":
      return (await getScene(contentId))?.uploaderId ?? null;
    case "clothes":
      return (await getClothes(contentId))?.uploaderId ?? null;
    case "softmods":
      return (await getSoftmod(contentId))?.uploaderId ?? null;
  }
}

const NOTES_OWNER_ONLY = "Only the uploader can change version notes.";

/**
 * Uploader id for an owner-checked metadata patch.
 * Admins may edit another item's description. They may not send `notes`
 * on someone else's item; that request is rejected before the service runs.
 */
export async function metadataEdit(
  user: User,
  loadOwner: () => Promise<string | null | undefined>,
  notes: string | undefined,
  set: StatusSetter,
): Promise<{ uploaderId: string; notes?: string } | null> {
  const ownerId = isAdmin(user) ? await loadOwner() : undefined;
  const editingAnother = ownerId != null && ownerId !== user.id;
  if (editingAnother && notes !== undefined) {
    set.status = 400;
    return null;
  }
  return {
    uploaderId: editingAnother ? ownerId : user.id,
    notes,
  };
}

export { NOTES_OWNER_ONLY };

export async function readContentTags(
  kind: TaggableContentKind,
  contentId: string,
  set: StatusSetter,
) {
  const uploaderId = await uploaderIdOf(kind, contentId);
  if (!uploaderId) {
    set.status = 404;
    return { error: "Not found" };
  }
  return { tags: getContentTags({ kind, contentId }) };
}

export async function writeContentTags(input: {
  kind: TaggableContentKind;
  contentId: string;
  names: string[];
  user: User | null;
  set: StatusSetter;
}) {
  if (!input.user) {
    input.set.status = 401;
    return { error: "Unauthorized" };
  }
  const uploaderId = await uploaderIdOf(input.kind, input.contentId);
  if (!uploaderId) {
    input.set.status = 404;
    return { error: "Not found" };
  }
  try {
    return {
      tags: setContentTags({
        kind: input.kind,
        contentId: input.contentId,
        names: input.names,
        actor: { userId: input.user.id, isAdmin: isAdmin(input.user) },
        uploaderId,
      }),
    };
  } catch (err) {
    return handleTagError(err, input.set);
  }
}
