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
  readonly version: number;
  readonly conflict: { softmodId: string; version: number };

  constructor(softmodId: string, version: number) {
    super(
      409,
      "CONFLICT",
      `Duplicate softmod content hash (already exists in softmod ${softmodId} v${version})`,
    );
    this.name = "DuplicateSoftmodHashError";
    this.softmodId = softmodId;
    this.softmod_id = softmodId;
    this.version = version;
    this.conflict = { softmodId, version };
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
