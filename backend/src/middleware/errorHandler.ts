/**
 * NexChat — Centralized Error Handler
 *
 * Replaces: GlobalExceptionHandler.java (@RestControllerAdvice)
 *
 * Fastify's setErrorHandler catches all errors thrown from route handlers.
 * This maps our typed AppError subclasses (and Fastify/Zod errors) to the
 * standard ApiResponse envelope: { success, message, timestamp }.
 *
 * The React frontend expects this exact shape on errors — preserving it means
 * no frontend error-handling code needs to change during migration.
 */
import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { isAppError, ValidationError } from "../utils/errors.js";
import { errorResponse } from "../utils/apiResponse.js";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, _request, reply) => {
    // ── Operational AppErrors (expected, safe to expose message) ──────────
    if (isAppError(error)) {
      // ValidationError: may include per-field error details
      if (error instanceof ValidationError && error.fields) {
        return reply.code(error.statusCode).send({
          ...errorResponse(error.message),
          fields: error.fields,
        });
      }

      return reply.code(error.statusCode).send(errorResponse(error.message));
    }

    // ── Zod validation errors ──────────────────────────────────────────────
    if (error instanceof ZodError) {
      const fields: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const path = issue.path.join(".");
        if (!fields[path]) fields[path] = [];
        fields[path]!.push(issue.message);
      }
      return reply.code(400).send({
        ...errorResponse("Validation failed"),
        fields,
      });
    }

    // ── Fastify built-in errors (FST_ERR_* codes) ─────────────────────────
    // These are framework-level errors with statusCode already set.
    if ("statusCode" in error && typeof error.statusCode === "number") {
      // 429 from @fastify/rate-limit
      if (error.statusCode === 429) {
        return reply.code(429).send(
          errorResponse("Too many requests. Please try again later.")
        );
      }
      // Other 4xx: pass message through (e.g. 404 from Fastify routing)
      if (error.statusCode >= 400 && error.statusCode < 500) {
        return reply
          .code(error.statusCode)
          .send(errorResponse(error.message));
      }
    }

    // ── Unexpected / non-operational errors ───────────────────────────────
    // Log the full error internally but return a generic message to the client.
    app.log.error({ err: error }, "Unhandled error");
    return reply.code(500).send(errorResponse("An unexpected error occurred"));
  });

  // 404 handler for routes that don't exist
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send(errorResponse("Route not found"));
  });
}
