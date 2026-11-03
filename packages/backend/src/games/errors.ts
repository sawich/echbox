export class GameServiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "GameServiceError";
    this.status = status;
    this.code = code;
  }
}

export class GameNotFoundError extends GameServiceError {
  constructor(message = "Game not found") {
    super(message, 404, "game_not_found");
    this.name = "GameNotFoundError";
  }
}

export class GameConflictError extends GameServiceError {
  constructor(message: string, code = "game_conflict") {
    super(message, 409, code);
    this.name = "GameConflictError";
  }
}

export class BadGameError extends GameServiceError {
  constructor(message: string, code = "bad_game") {
    super(message, 400, code);
    this.name = "BadGameError";
  }
}
