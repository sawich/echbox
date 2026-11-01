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
  readonly version: number;
  readonly conflict: { cardId: string; version: number };

  constructor(cardId: string, version: number) {
    super(
      409,
      "CONFLICT",
      `Duplicate card content hash (already exists in card ${cardId} v${version})`,
    );
    this.name = "DuplicateCardHashError";
    this.cardId = cardId;
    this.card_id = cardId;
    this.version = version;
    this.conflict = { cardId, version };
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
