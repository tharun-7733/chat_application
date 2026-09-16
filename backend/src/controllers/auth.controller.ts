/**
 * NexChat — Auth Controller
 *
 * Mirrors: com.nexchat.controller.AuthController
 *
 * HTTP layer only — parsing, validation, delegation to AuthService, response shaping.
 * No business logic lives here.
 *
 * Endpoints (all public — no JWT required):
 *   POST /api/auth/register  → 201 + AuthResponse
 *   POST /api/auth/login     → 200 + AuthResponse
 *   POST /api/auth/refresh   → 200 + { accessToken, accessTokenExpiresAt }
 *   POST /api/auth/logout    → 200 (no body)
 *   GET  /api/auth/health    → 200 (smoke test)
 *
 * Request validation: Zod schemas with messages matching Java's Bean Validation
 * messages exactly — frontend can use the same error handling code.
 */
import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import * as AuthService from "../services/auth.service.js";
import { successResponse } from "../utils/apiResponse.js";


// ── Validation schemas ────────────────────────────────────────────────────────
// Messages are intentionally identical to Java's @Size/@Pattern/@Email messages.

export const RegisterSchema = z.object({
  username: z
    .string({ required_error: "Username is required" })
    .min(3, "Username must be between 3 and 50 characters")
    .max(50, "Username must be between 3 and 50 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, underscores, and hyphens"
    ),
  email: z
    .string({ required_error: "Email is required" })
    .email("Please provide a valid email address")
    .max(255, "Email must not exceed 255 characters"),
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be between 8 and 128 characters")
    .max(128, "Password must be between 8 and 128 characters")
    .regex(
      /^(?=.*[A-Z])(?=.*\d).+$/,
      "Password must contain at least one uppercase letter and one digit"
    ),
});

export const LoginSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Please provide a valid email address"),
  password: z
    .string({ required_error: "Password is required" })
    .min(1, "Password is required"),
});

export const RefreshSchema = z.object({
  refreshToken: z
    .string({ required_error: "Refresh token is required" })
    .min(1, "Refresh token is required"),
});

export const LogoutSchema = z.object({
  refreshToken: z
    .string({ required_error: "Refresh token is required" })
    .min(1, "Refresh token is required"),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate a Zod schema against request body.
 * On failure, sends 400 with field-level error map (matches Java's GlobalExceptionHandler).
 *
 * Returns the parsed data on success, undefined on failure (reply is already sent).
 */
function validateBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
  reply: FastifyReply
): T | undefined {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join(".") || "body";
      fieldErrors[field] = issue.message;
    }
    reply.code(400).send({
      success: false,
      message: "Validation failed",
      data: fieldErrors,
    });
    return undefined;
  }
  return result.data;
}

/** Extract client IP from Fastify request (X-Forwarded-For or socket) */
function getClientIp(request: FastifyRequest): string | undefined {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim();
  return request.socket.remoteAddress;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * HTTP 201 Created — matches Java: ResponseEntity.status(HttpStatus.CREATED)
 */
export async function registerHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = validateBody(RegisterSchema, request.body, reply);
  if (!body) return;

  const authResponse = await AuthService.register(
    body.username,
    body.email,
    body.password,
    getClientIp(request),
    request.headers["user-agent"]
  );

  return reply.code(201).send(
    successResponse("Registration successful. Welcome to NexChat!", authResponse)
  );
}

/**
 * POST /api/auth/login
 * HTTP 200 OK
 */
export async function loginHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = validateBody(LoginSchema, request.body, reply);
  if (!body) return;

  const authResponse = await AuthService.login(
    body.email,
    body.password,
    getClientIp(request),
    request.headers["user-agent"]
  );

  return reply.code(200).send(
    successResponse("Login successful", authResponse)
  );
}

/**
 * POST /api/auth/refresh
 * Body: { refreshToken: string }
 * Returns: { accessToken, accessTokenExpiresAt } — frontend updates localStorage
 */
export async function refreshHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = validateBody(RefreshSchema, request.body, reply);
  if (!body) return;

  const result = await AuthService.refresh(body.refreshToken);

  return reply.code(200).send(
    successResponse("Token refreshed", result)
  );
}

/**
 * POST /api/auth/logout
 * Body: { refreshToken: string }
 * Idempotent — always returns 200, even if token was already revoked.
 */
export async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = validateBody(LogoutSchema, request.body, reply);
  if (!body) return;

  await AuthService.logout(body.refreshToken);

  return reply.code(200).send(
    successResponse("Logged out successfully", null)
  );
}

/**
 * GET /api/auth/health
 * Smoke test — confirms auth routes are registered.
 */
export async function authHealthHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  return reply.code(200).send(
    successResponse("Auth service is running", "OK")
  );
}
