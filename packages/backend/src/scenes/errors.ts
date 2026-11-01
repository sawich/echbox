export class SceneServiceError extends Error {
  readonly status: number;
  readonly statusCode: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "SceneServiceError";
    this.status = status;
    this.statusCode = status;
    this.code = code;
  }
}

export class DuplicateSceneHashError extends SceneServiceError {
  readonly sceneId: string;
  readonly scene_id: string;
  readonly version: number;
  readonly conflict: { sceneId: string; version: number };

  constructor(sceneId: string, version: number) {
    super(
      409,
      "CONFLICT",
      `Duplicate scene content hash (already exists in scene ${sceneId} v${version})`,
    );
    this.name = "DuplicateSceneHashError";
    this.sceneId = sceneId;
    this.scene_id = sceneId;
    this.version = version;
    this.conflict = { sceneId, version };
  }
}

export class ForbiddenSceneError extends SceneServiceError {
  constructor(message = "Forbidden: only the scene author may modify this scene") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenSceneError";
  }
}

export class BadSceneError extends SceneServiceError {
  constructor(message = "Invalid Koikatsu scene") {
    super(400, "BAD_SCENE", message);
    this.name = "BadSceneError";
  }
}

export class SceneNotFoundError extends SceneServiceError {
  constructor(message = "Scene not found") {
    super(404, "NOT_FOUND", message);
    this.name = "SceneNotFoundError";
  }
}
