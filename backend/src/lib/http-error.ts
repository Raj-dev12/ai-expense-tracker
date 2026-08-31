/**
 * An error that already knows which HTTP status it should become. Routes throw
 * these; the error handler registered in index.ts turns them into responses, so
 * no route has to repeat the same reply-formatting code.
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
