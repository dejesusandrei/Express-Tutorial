export class AppError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;
  details?: Record<string, string[]>;

  constructor(
    message: string,
    statusCode = 500,
    code = "INTERNAL_SERVER_ERROR",
    details?: Record<string, string[]>
  ) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}