export class SoftmodServiceError extends Error {
  readonly status: number;
  readonly statusCode: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "SoftmodServiceError";
    this.status = status;
    this.statusCode = status;
    this.code = code;
  }
}

export class DuplicateSoftmodHashError extends SoftmodServiceError {
  readonly softmodId: string;
  readonly softmod_id: string;
  readonly versionId: string;
  readonly semver: string;
  readonly conflict: { softmodId: string; versionId: string; semver: string };

  constructor(softmodId: string, versionId: string, semver: string) {
    super(
      409,
      "CONFLICT",
      `Duplicate softmod content hash (already exists in softmod ${softmodId} v${semver})`,
    );
    this.name = "DuplicateSoftmodHashError";
    this.softmodId = softmodId;
    this.softmod_id = softmodId;
    this.versionId = versionId;
    this.semver = semver;
    this.conflict = { softmodId, versionId, semver };
  }
}

export class DuplicateSoftmodSemverError extends SoftmodServiceError {
  readonly softmodId: string;
  readonly softmod_id: string;
  readonly versionId: string;
  readonly semver: string;
  readonly conflict: { softmodId: string; versionId: string; semver: string };

  constructor(softmodId: string, versionId: string, semver: string) {
    super(
      409,
      "CONFLICT",
      `Softmod ${softmodId} already has version ${semver}`,
    );
    this.name = "DuplicateSoftmodSemverError";
    this.softmodId = softmodId;
    this.softmod_id = softmodId;
    this.versionId = versionId;
    this.semver = semver;
    this.conflict = { softmodId, versionId, semver };
  }
}

export class SoftmodGuidConflictError extends SoftmodServiceError {
  readonly softmodId: string;
  readonly softmod_id: string;

  constructor(softmodId: string) {
    super(
      409,
      "CONFLICT",
      `Softmod GUID already exists (${softmodId})`,
    );
    this.name = "SoftmodGuidConflictError";
    this.softmodId = softmodId;
    this.softmod_id = softmodId;
  }
}

export class ForbiddenSoftmodError extends SoftmodServiceError {
  constructor(message = "Forbidden: only the softmod author may modify this softmod") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenSoftmodError";
  }
}

export class BadSoftmodError extends SoftmodServiceError {
  constructor(message = "Invalid softmod archive") {
    super(400, "BAD_SOFTMOD", message);
    this.name = "BadSoftmodError";
  }
}

export class SoftmodNotFoundError extends SoftmodServiceError {
  constructor(message = "Softmod not found") {
    super(404, "NOT_FOUND", message);
    this.name = "SoftmodNotFoundError";
  }
}
