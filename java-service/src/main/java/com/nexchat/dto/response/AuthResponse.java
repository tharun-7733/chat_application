/**
 * NexChat — Auth Response DTO
 *
 * Returned by POST /api/auth/register and POST /api/auth/login.
 * Contains both tokens and the user profile — the frontend gets
 * everything it needs in a single response (no second API call).
 *
 * ⚠️ SECURITY: The refresh token is returned here in the response body.
 * In a web app, the more secure option is an httpOnly cookie for the
 * refresh token (prevents XSS from stealing it). For this API (which
 * also serves mobile clients), the body is acceptable. We document the
 * tradeoff so it's a conscious decision, not an oversight.
 */
package com.nexchat.dto.response;

import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Getter
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class AuthResponse {

    // JWT access token — short-lived (15 min), used on every API request.
    private String accessToken;

    // JWT refresh token — longer-lived (7 days), used only to get new access tokens.
    private String refreshToken;

    // Convenience: client can schedule a refresh before expiry without
    // decoding the JWT to read the 'exp' claim.
    private Instant accessTokenExpiresAt;

    // User profile embedded in auth response — saves a round trip.
    private UserProfile user;

    /*
     * Nested DTO for the user profile subset.
     * We include only what the frontend needs immediately after login.
     * Notice: NO passwordHash, NO sessionId — zero leakage of internal state.
     */
    @Getter
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class UserProfile {
        private UUID id;
        private String username;
        private String email;
        private String avatarUrl;
        private String statusMessage;
    }
}
