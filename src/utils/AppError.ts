export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(401, message);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(403, message);
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError(404, message);
  }

  static conflict(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(409, message, details);
  }

  static unprocessable(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(422, message, details);
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError(500, message);
  }
}
