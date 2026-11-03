export class CardServiceError extends Error {
  readonly status: number;
  readonly statusCode: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CardServiceError";
    this.status = status;
    this.statusCode = status;
    this.code = code;
  }
}

export class DuplicateCardHashError extends CardServiceError {
  readonly cardId: string;
  readonly card_id: string;
  readonly versionId: string;
  readonly semver: string;
  readonly conflict: { cardId: string; versionId: string; semver: string };

  constructor(cardId: string, versionId: string, semver: string) {
    super(
      409,
      "CONFLICT",
      `Duplicate card content hash (already exists in card ${cardId} v${semver})`,
    );
    this.name = "DuplicateCardHashError";
    this.cardId = cardId;
    this.card_id = cardId;
    this.versionId = versionId;
    this.semver = semver;
    this.conflict = { cardId, versionId, semver };
  }
}

export class DuplicateCardSemverError extends CardServiceError {
  readonly cardId: string;
  readonly semver: string;
  readonly conflict: { cardId: string; semver: string };

  constructor(cardId: string, semver: string) {
    super(
      409,
      "DUPLICATE_SEMVER",
      `Card ${cardId} already has version ${semver}`,
    );
    this.name = "DuplicateCardSemverError";
    this.cardId = cardId;
    this.semver = semver;
    this.conflict = { cardId, semver };
  }
}

export class ForbiddenCardError extends CardServiceError {
  constructor(message = "Forbidden: only the card author may modify this card") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenCardError";
  }
}

export class BadCardError extends CardServiceError {
  constructor(message = "Invalid Koikatsu character card") {
    super(400, "BAD_CARD", message);
    this.name = "BadCardError";
  }
}

export class CardNotFoundError extends CardServiceError {
  constructor(message = "Card not found") {
    super(404, "NOT_FOUND", message);
    this.name = "CardNotFoundError";
  }
}
