export class ClothesServiceError extends Error {
  readonly status: number;
  readonly statusCode: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ClothesServiceError";
    this.status = status;
    this.statusCode = status;
    this.code = code;
  }
}

export class DuplicateClothesHashError extends ClothesServiceError {
  readonly clothesId: string;
  readonly clothes_id: string;
  readonly versionId: string;
  readonly semver: string;
  readonly conflict: { clothesId: string; versionId: string; semver: string };

  constructor(clothesId: string, versionId: string, semver: string) {
    super(
      409,
      "CONFLICT",
      `This file was already uploaded as version ${semver}.`,
    );
    this.name = "DuplicateClothesHashError";
    this.clothesId = clothesId;
    this.clothes_id = clothesId;
    this.versionId = versionId;
    this.semver = semver;
    this.conflict = { clothesId, versionId, semver };
  }
}

export class DuplicateClothesSemverError extends ClothesServiceError {
  readonly clothesId: string;
  readonly semver: string;
  readonly conflict: { clothesId: string; semver: string };

  constructor(clothesId: string, semver: string) {
    super(
      409,
      "DUPLICATE_SEMVER",
      `Version ${semver} already exists for this clothes card.`,
    );
    this.name = "DuplicateClothesSemverError";
    this.clothesId = clothesId;
    this.semver = semver;
    this.conflict = { clothesId, semver };
  }
}

export class ForbiddenClothesError extends ClothesServiceError {
  constructor(message = "Only the author can change this clothes card.") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenClothesError";
  }
}

export class BadClothesError extends ClothesServiceError {
  constructor(message = "Invalid Koikatsu clothes card") {
    super(400, "BAD_SCENE", message);
    this.name = "BadClothesError";
  }
}

export class ClothesNotFoundError extends ClothesServiceError {
  constructor(message = "Clothes not found") {
    super(404, "NOT_FOUND", message);
    this.name = "ClothesNotFoundError";
  }
}
