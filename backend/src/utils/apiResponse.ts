/**
 * NexChat — API Response Envelope Builder
 *
 * Matches the exact JSON shape that Java's ApiResponse<T> produces:
 * {
 *   "success": true,
 *   "message": "...",
 *   "data": { ... },
 *   "timestamp": "2024-01-01T10:00:00.000Z"
 * }
 *
 * The React frontend and Go service both depend on this envelope shape.
 * Keeping it identical means ZERO frontend changes during the migration.
 */

export interface ApiResponse<T = undefined> {
  success: boolean;
  message: string;
  data?: T;
  timestamp: string;
}

/**
 * Build a successful response envelope.
 *
 * @example
 * reply.code(200).send(successResponse("Login successful", { accessToken, user }));
 */
export function successResponse<T>(
  message: string,
  data?: T
): ApiResponse<T> {
  return {
    success: true,
    message,
    ...(data !== undefined ? { data } : {}),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build an error response envelope.
 *
 * @example
 * reply.code(400).send(errorResponse("Email already registered"));
 */
export function errorResponse(message: string): ApiResponse<never> {
  return {
    success: false,
    message,
    timestamp: new Date().toISOString(),
  };
}
