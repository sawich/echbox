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
      `This file was already uploaded as version ${semver}.`,
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
      "DUPLICATE_SEMVER",
      `Version ${semver} already exists for this softmod.`,
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
      "A softmod with this GUID is already in the library.",
    );
    this.name = "SoftmodGuidConflictError";
    this.softmodId = softmodId;
    this.softmod_id = softmodId;
  }
}

export class ForbiddenSoftmodError extends SoftmodServiceError {
  constructor(message = "Only the author can change this softmod.") {
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
