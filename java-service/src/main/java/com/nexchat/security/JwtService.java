/**
 * NexChat — JWT Service
 *
 * Encapsulates all JWT operations: generation, validation, and claim extraction.
 * This service is the cryptographic core of the authentication system.
 *
 * Token Lifecycle:
 *   1. Login  → generateAccessToken() + generateRefreshToken()
 *   2. Request → extractUserId() → validate() → authorize
 *   3. Refresh → validate refresh token → generateAccessToken()
 *   4. Logout  → mark session inactive in DB (refresh token revoked)
 *
 * Algorithm: HMAC-SHA256 (HS256) — symmetric, single-key signing.
 * The signing key is derived from the JWT_SECRET environment variable.
 */
package com.nexchat.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import io.jsonwebtoken.security.SignatureException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Service
@Slf4j // Lombok: generates private static final Logger log = LoggerFactory.getLogger(JwtService.class)
public class JwtService {

    /*
     * @Value reads from application.yml's nexchat.jwt.secret.
     * The secret MUST be at least 256 bits (32 bytes) for HMAC-SHA256.
     * Our default in application.yml is intentionally long for dev safety.
     */
    @Value("${nexchat.jwt.secret}")
    private String jwtSecret;

    @Value("${nexchat.jwt.access-token-expiration}")
    private long accessTokenExpirationMs;

    @Value("${nexchat.jwt.refresh-token-expiration}")
    private long refreshTokenExpirationMs;

    /*
     * Lazily computed signing key. We derive the SecretKey from the raw secret
     * string using Keys.hmacShaKeyFor(). The key bytes must be >= 256 bits for HS256.
     *
     * ⚠️ We recompute this on every call rather than caching it as a field
     * because @Value injection happens AFTER field initialization. If we used
     * a field initializer, jwtSecret would still be null.
     */
    private SecretKey getSigningKey() {
        byte[] keyBytes = jwtSecret.getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    /**
     * Generates a short-lived access token.
     *
     * Claims embedded in the token (readable without verification):
     * - sub (subject): the user's UUID — primary identifier
     * - type: "ACCESS" — distinguishes token types server-side
     * - iat (issued at): auto-added by JJWT
     * - exp (expiration): auto-added from expiration Date
     *
     * @param userId The authenticated user's UUID
     * @return Signed JWT string, e.g. "eyJhbGc..."
     */
    public String generateAccessToken(UUID userId) {
        Instant now = Instant.now();
        Instant expiresAt = now.plusMillis(accessTokenExpirationMs);

        return Jwts.builder()
            .subject(userId.toString())       // 'sub' claim
            .claim("type", "ACCESS")          // custom claim for token type check
            .issuedAt(Date.from(now))         // 'iat' claim
            .expiration(Date.from(expiresAt)) // 'exp' claim
            .signWith(getSigningKey())         // signs with HS256 by default
            .compact();                        // serializes to "header.payload.signature"
    }

    /**
     * Generates a long-lived refresh token.
     *
     * ⚠️ IMPORTANT: Refresh tokens are also JWTs, but we ADDITIONALLY store
     * a hash of them in the sessions table. This is what enables revocation.
     * The JWT alone can't be revoked — the DB record can.
     *
     * @param userId The authenticated user's UUID
     * @return Signed JWT string for refresh use
     */
    public String generateRefreshToken(UUID userId) {
        Instant now = Instant.now();
        Instant expiresAt = now.plusMillis(refreshTokenExpirationMs);

        return Jwts.builder()
            .subject(userId.toString())
            .claim("type", "REFRESH")
            .issuedAt(Date.from(now))
            .expiration(Date.from(expiresAt))
            .signWith(getSigningKey())
            .compact();
    }

    /**
     * Extracts the user UUID from a token's 'sub' claim.
     * This is the ONLY user identifier embedded in the token.
     *
     * @param token The raw JWT string (without "Bearer " prefix)
     * @return The user's UUID
     * @throws JwtException if token is invalid or expired
     */
    public UUID extractUserId(String token) {
        String subject = extractAllClaims(token).getSubject();
        return UUID.fromString(subject);
    }

    /**
     * Validates that a token:
     * 1. Has a valid signature (wasn't tampered with)
     * 2. Hasn't expired
     * 3. Has the expected type claim
     *
     * @param token The raw JWT string
     * @param expectedType "ACCESS" or "REFRESH"
     * @return true if valid
     */
    public boolean isTokenValid(String token, String expectedType) {
        try {
            Claims claims = extractAllClaims(token);
            String tokenType = claims.get("type", String.class);
            return expectedType.equals(tokenType);
            // If we reach here, the signature was valid and the token isn't expired.
            // (JJWT throws ExpiredJwtException automatically on expiry.)
        } catch (ExpiredJwtException e) {
            log.debug("JWT token expired: {}", e.getMessage());
            return false;
        } catch (SignatureException e) {
            // ⚠️ SECURITY: Log at WARN level — this could be an attack.
            log.warn("Invalid JWT signature detected — possible token tampering");
            return false;
        } catch (MalformedJwtException e) {
            log.debug("Malformed JWT token: {}", e.getMessage());
            return false;
        } catch (JwtException e) {
            log.debug("JWT validation failed: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Returns the expiration Instant for access tokens.
     * Used to populate the 'accessTokenExpiresAt' field in AuthResponse.
     */
    public Instant getAccessTokenExpiresAt() {
        return Instant.now().plusMillis(accessTokenExpirationMs);
    }

    /*
     * Core parsing method. All extract/validate methods delegate here.
     * Throws JwtException subclasses on any validation failure.
     *
     * The JwtParserBuilder verifyWith() sets the key used to verify the signature.
     * If the signature doesn't match, JJWT throws SignatureException.
     * If the token is expired, JJWT throws ExpiredJwtException.
     */
    private Claims extractAllClaims(String token) {
        return Jwts.parser()
            .verifyWith(getSigningKey())
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }
}
