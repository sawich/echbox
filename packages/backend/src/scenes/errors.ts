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
  readonly versionId: string;
  readonly semver: string;
  readonly conflict: { sceneId: string; versionId: string; semver: string };

  constructor(sceneId: string, versionId: string, semver: string) {
    super(
      409,
      "CONFLICT",
      `This file was already uploaded as version ${semver}.`,
    );
    this.name = "DuplicateSceneHashError";
    this.sceneId = sceneId;
    this.scene_id = sceneId;
    this.versionId = versionId;
    this.semver = semver;
    this.conflict = { sceneId, versionId, semver };
  }
}

export class DuplicateSceneSemverError extends SceneServiceError {
  readonly sceneId: string;
  readonly semver: string;
  readonly conflict: { sceneId: string; semver: string };

  constructor(sceneId: string, semver: string) {
    super(
      409,
      "DUPLICATE_SEMVER",
      `Version ${semver} already exists for this scene.`,
    );
    this.name = "DuplicateSceneSemverError";
    this.sceneId = sceneId;
    this.semver = semver;
    this.conflict = { sceneId, semver };
  }
}

export class ForbiddenSceneError extends SceneServiceError {
  constructor(message = "Only the author can change this scene.") {
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
