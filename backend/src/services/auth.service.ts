/**
 * NexChat — Auth Service
 *
 * Mirrors: com.nexchat.service.AuthService
 *
 * Implements the full authentication lifecycle:
 *   register()  → validate → hash → persist → issue tokens → store session
 *   login()     → verify credentials → issue tokens → store session
 *   refresh()   → verify refresh token → check session → issue new access token
 *   logout()    → revoke session
 *
 * Security guarantees:
 *  - BCrypt strength 12 (matches Java SecurityConfig.passwordEncoder())
 *  - Passwords never appear in logs or return values
 *  - Same error message for "email not found" and "wrong password" (anti-enumeration)
 *  - Refresh tokens stored as SHA-256 hash in sessions collection (revocable)
 *  - Access tokens are stateless (cannot be revoked — short expiry is the mitigation)
 *
 * NOTE: Unlike Java's buildAuthResponse() which had "TODO: save refresh token",
 * this implementation FULLY persists refresh token hashes (session.repository.ts).
 */
import bcrypt from "bcrypt";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import {
  signAccessToken,
  signRefreshToken,
  getAccessTokenExpiresAt,
  verifyRefreshToken,
  JwtTokenExpiredError,
  JwtTokenInvalidError,
} from "./jwt.service.js";
import {
  createUser,
  existsByEmail,
  existsByUsername,
  findUserByEmailWithPassword,
  type SafeUser,
} from "../repositories/user.repository.js";
import {
  createSession,
  findActiveSessionByToken,
  revokeSession,
} from "../repositories/session.repository.js";
import {
  ConflictError,
  UnauthorizedError,
} from "../utils/errors.js";


// ── BCrypt work factor — must match Java's BCryptPasswordEncoder(12) ──────────
const BCRYPT_ROUNDS = config.bcryptSaltRounds;

// ── Response shape (mirrors Java AuthResponse DTO exactly) ───────────────────

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null | undefined;
  statusMessage: string | null | undefined;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  /** ISO string — matches Java's Instant serialization */
  accessTokenExpiresAt: string;
  user: UserProfile;
}

// ── Internal helper ───────────────────────────────────────────────────────────

/**
 * Build the AuthResponse and persist a new session.
 * Single source of truth for token issuance — used by register() and login().
 */
async function buildAuthResponse(
  user: SafeUser,
  clientIp?: string,
  deviceInfo?: string
): Promise<AuthResponse> {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);
  const expiresAt = getAccessTokenExpiresAt();

  // Persist the refresh token hash → enables revocation via logout/logout-all
  const refreshExpiry = new Date(Date.now() + config.jwtRefreshExpiryMs);
  await createSession({
    userId: user._id,
    rawToken: refreshToken,
    expiresAt: refreshExpiry,
    ...(clientIp ? { ipAddress: clientIp } : {}),
    ...(deviceInfo ? { deviceInfo } : {}),
  });


  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: expiresAt.toISOString(),
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      statusMessage: user.statusMessage,
    },
  };
}

// ── Service methods ───────────────────────────────────────────────────────────

/**
 * Register a new user account.
 *
 * Steps (mirrors Java AuthService.register()):
 *  1. Validate email + username uniqueness
 *  2. Hash password with BCrypt strength 12
 *  3. Persist user to MongoDB
 *  4. Issue tokens + store session
 *  5. Return AuthResponse
 *
 * @throws ConflictError if email or username is taken
 */
export async function register(
  username: string,
  email: string,
  password: string,
  clientIp?: string,
  deviceInfo?: string
): Promise<AuthResponse> {
  const normalizedEmail = email.toLowerCase().trim();
  const trimmedUsername = username.trim();

  // Step 1: Uniqueness checks (email first — primary identifier)
  if (await existsByEmail(normalizedEmail)) {
    throw new ConflictError("An account with this email already exists");
  }
  if (await existsByUsername(trimmedUsername)) {
    throw new ConflictError(
      "This username is already taken. Please choose a different one."
    );
  }

  // Step 2: Hash the password — raw password is not needed after this line
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Step 3: Persist user
  const newUser = await createUser({
    username: trimmedUsername,
    email: normalizedEmail,
    passwordHash,
  });

  logger.info({ userId: newUser._id, username: newUser.username }, "New user registered");

  // Step 4 & 5: Issue tokens, store session, return response
  return buildAuthResponse(newUser, clientIp, deviceInfo);
}

/**
 * Authenticate an existing user and return tokens.
 *
 * ⚠️ SECURITY: Always throw the same generic error whether:
 *   - the email doesn't exist, OR
 *   - the password is wrong.
 * This prevents user enumeration attacks.
 *
 * @throws UnauthorizedError with generic "Invalid email or password" message
 */
export async function login(
  email: string,
  password: string,
  clientIp?: string,
  deviceInfo?: string
): Promise<AuthResponse> {
  const normalizedEmail = email.toLowerCase().trim();

  // Load user WITH password hash — this is the only place we do this
  const userWithHash = await findUserByEmailWithPassword(normalizedEmail);

  // Generic error for both "not found" and "wrong password" (anti-enumeration)
  const INVALID_CREDS = new UnauthorizedError("Invalid email or password");

  if (!userWithHash) {
    // Run a dummy bcrypt comparison to prevent timing-based user enumeration
    // (without this, "not found" returns much faster than "wrong password")
    await bcrypt.hash("dummy", BCRYPT_ROUNDS);
    throw INVALID_CREDS;
  }

  const passwordMatches = await bcrypt.compare(password, userWithHash.passwordHash);
  if (!passwordMatches) {
    throw INVALID_CREDS;
  }

  // Strip passwordHash before building the response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _omit, ...safeUser } = userWithHash;

  logger.info({ userId: safeUser._id }, "User logged in");

  return buildAuthResponse(safeUser as SafeUser, clientIp, deviceInfo);
}

/**
 * Exchange a valid, active refresh token for a new access token.
 *
 * Two-layer verification:
 *  1. Cryptographic: JWT signature + expiry + type claim
 *  2. Persistence:   Session must exist and be active in MongoDB
 *     (handles: logout, revocation, DB-level expiry)
 *
 * @throws UnauthorizedError if token is invalid, expired, or revoked
 */
export async function refresh(rawRefreshToken: string): Promise<{
  accessToken: string;
  accessTokenExpiresAt: string;
}> {
  // Layer 1: Verify JWT (signature, expiry, type)
  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch (err) {
    if (err instanceof JwtTokenExpiredError) {
      throw new UnauthorizedError("Refresh token has expired. Please log in again.");
    }
    if (err instanceof JwtTokenInvalidError) {
      throw new UnauthorizedError("Invalid refresh token.");
    }
    throw err;
  }

  // Layer 2: Check session is still active in DB (not logged out/revoked)
  const session = await findActiveSessionByToken(rawRefreshToken);
  if (!session) {
    throw new UnauthorizedError(
      "Refresh token has been revoked. Please log in again."
    );
  }

  // Verify the session userId matches the token's sub (defense in depth)
  if (session.userId !== payload.sub) {
    logger.warn(
      { sessionUserId: session.userId, tokenSub: payload.sub },
      "Session userId / token sub mismatch — possible token substitution"
    );
    throw new UnauthorizedError("Invalid refresh token.");
  }

  // Issue a new access token (refresh token is reused until it expires)
  const newAccessToken = signAccessToken(payload.sub);
  const expiresAt = getAccessTokenExpiresAt();

  logger.info({ userId: payload.sub }, "Access token refreshed");

  return {
    accessToken: newAccessToken,
    accessTokenExpiresAt: expiresAt.toISOString(),
  };
}

/**
 * Revoke a refresh token (logout from the current device).
 * Soft-deletes the session record (isActive → false).
 *
 * Returns silently even if the token is not found — idempotent by design.
 * This prevents leaking information about whether a token was valid.
 */
export async function logout(rawRefreshToken: string): Promise<void> {
  const revoked = await revokeSession(rawRefreshToken);
  if (revoked) {
    // Decode without verification to get userId for audit log
    // (token may be expired, but we still want to log the logout)
    import("./jwt.service.js").then(({ decodeTokenUnsafe }) => {
      const payload = decodeTokenUnsafe(rawRefreshToken);
      if (payload?.sub) {
        logger.info({ userId: payload.sub }, "User logged out");
      }
    });
  }
}

