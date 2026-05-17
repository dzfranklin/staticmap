export class HttpError extends Error {
  name = "HttpError";
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class ParseError extends HttpError {
  name = "ParseError";
  private _message: string;
  constructor(
    message: string,
    readonly command?: string,
  ) {
    super(
      400,
      `Parse error${command ? ` in command "${command}"` : ""}: ${message}`,
    );
    this._message = message;
  }

  static withCommand(err: ParseError, command: string): ParseError {
    return new ParseError(err._message, command);
  }
}
