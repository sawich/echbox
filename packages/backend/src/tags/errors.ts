export class TagServiceError extends Error {
  readonly status: number;
  readonly statusCode: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "TagServiceError";
    this.status = status;
    this.statusCode = status;
    this.code = code;
  }
}

export class TagNotFoundError extends TagServiceError {
  constructor(message = "Tag not found") {
    super(404, "NOT_FOUND", message);
    this.name = "TagNotFoundError";
  }
}

export class ForbiddenTagError extends TagServiceError {
  constructor(message = "You cannot change this tag.") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenTagError";
  }
}

export class InvalidTagError extends TagServiceError {
  constructor(message = "Invalid tag") {
    super(400, "INVALID_TAG", message);
    this.name = "InvalidTagError";
  }
}

export class DuplicateTagError extends TagServiceError {
  constructor(message = "Tag already exists") {
    super(409, "CONFLICT", message);
    this.name = "DuplicateTagError";
  }
}
