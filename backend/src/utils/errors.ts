/**
 * NexChat — Application Error Classes
 *
 * Typed error hierarchy that maps cleanly to HTTP status codes.
 * The centralized error handler in middleware/errorHandler.ts catches
 * these and converts them to the standard ApiResponse envelope.
 *
 * Usage:
 *   throw new NotFoundError("User not found");
 *   throw new ConflictError("Email already registered");
 *   throw new UnauthorizedError("Invalid or expired token");
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    // Restore prototype chain (required when extending built-in Error in TS)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 — Request body failed validation */
export class ValidationError extends AppError {
  public readonly fields: Record<string, string[]> | undefined;

  constructor(message: string, fields?: Record<string, string[]>) {
    super(message, 400);
    this.fields = fields;
  }
}

/** 401 — Missing or invalid authentication credentials */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401);
  }
}

/** 403 — Authenticated but not permitted to access this resource */
export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super(message, 403);
  }
}

/** 404 — Resource not found */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

/** 409 — Conflict (e.g. duplicate email, duplicate username) */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

/** 429 — Rate limit exceeded */
export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests. Please try again later.") {
    super(message, 429);
  }
}

/** 500 — Unexpected internal error (non-operational) */
export class InternalError extends AppError {
  constructor(message = "An unexpected error occurred") {
    super(message, 500, false);
  }
}

/** Type guard: narrows unknown to AppError */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
