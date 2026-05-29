/**
 * NexChat — JWT Authentication Filter
 *
 * A Servlet filter that intercepts every HTTP request and performs JWT validation.
 * Sits in the Spring Security filter chain BEFORE UsernamePasswordAuthenticationFilter.
 *
 * Extends OncePerRequestFilter: guarantees this filter executes EXACTLY ONCE
 * per request, regardless of Spring's internal dispatching (forward, include, error).
 *
 * How it integrates with Spring Security:
 *   HTTP Request
 *     → [This Filter]
 *         → Extract + validate JWT
 *         → Load UserDetails
 *         → Set Authentication in SecurityContextHolder
 *     → [UsernamePasswordAuthenticationFilter] (skipped — already authenticated)
 *     → [ExceptionTranslationFilter] (handles AccessDeniedException)
 *     → [FilterSecurityInterceptor] (checks authorization rules)
 *     → Controller method
 */
package com.nexchat.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final UserDetailsServiceImpl userDetailsService;

    /*
     * The core filter logic. This method is called for EVERY HTTP request.
     * We must call filterChain.doFilter() to pass the request to the next filter,
     * otherwise the request processing stops here.
     *
     * @NonNull: tells the compiler/IDE these parameters are guaranteed non-null
     * by the framework (override contract).
     */
    @Override
    protected void doFilterInternal(
        @NonNull HttpServletRequest request,
        @NonNull HttpServletResponse response,
        @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        /*
         * Step 1: Extract the JWT from the Authorization header.
         * If no token is present (public endpoint, or missing header),
         * we skip authentication entirely and pass the request through.
         * The SecurityConfig will then deny access to protected endpoints.
         */
        String jwt = extractTokenFromRequest(request);

        if (jwt == null) {
            // No token — let the request pass. SecurityConfig handles authorization.
            filterChain.doFilter(request, response);
            return;
        }

        /*
         * Step 2: Check if the SecurityContext already has an authentication.
         * This prevents re-authenticating on every filter in the chain.
         * (Should not normally happen, but defensive coding is good here.)
         */
        if (SecurityContextHolder.getContext().getAuthentication() != null) {
            filterChain.doFilter(request, response);
            return;
        }

        /*
         * Step 3: Validate the token type and signature.
         * We only accept ACCESS tokens here (not REFRESH tokens — they're
         * only valid at the /api/auth/refresh endpoint).
         */
        if (!jwtService.isTokenValid(jwt, "ACCESS")) {
            log.debug("Invalid or expired access token on request to: {}", request.getRequestURI());
            // Pass through — no authentication set, endpoint auth rules will reject.
            filterChain.doFilter(request, response);
            return;
        }

        /*
         * Step 4: Extract the user ID and load the UserDetails.
         * We load from the DB to get current user state (e.g., account locked).
         */
        try {
            UUID userId = jwtService.extractUserId(jwt);
            /*
             * We use email as the UserDetailsService key. But we have a userId
             * in the token. We need to load by email for UserDetailsServiceImpl.
             *
             * Design note: we could store email in the JWT claims too (more efficient,
             * avoids a DB lookup). We deliberately don't — keeping userId as the
             * only identifier in the token is cleaner (email can change).
             *
             * This means we load by ID then get the email.
             * Alternative: add email claim to JWT (Phase 6 optimization).
             */
            UserDetails userDetails = userDetailsService.loadUserByUsername(
                // Load the user by ID and get their email for the UserDetailsService
                loadEmailByUserId(userId)
            );

            /*
             * Step 5: Create the Authentication token and set it in SecurityContextHolder.
             *
             * UsernamePasswordAuthenticationToken(principal, credentials, authorities):
             * - principal: the UserDetails object (contains user info)
             * - credentials: null — we don't need the password after token validation
             * - authorities: the user's roles/permissions
             *
             * Setting all three parameters marks the token as AUTHENTICATED.
             * Setting only two (principal, credentials) marks it as NOT authenticated.
             * This is a subtle but critical distinction in Spring Security internals.
             */
            UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                userDetails,
                null, // credentials intentionally null — already authenticated via JWT
                userDetails.getAuthorities()
            );

            /*
             * WebAuthenticationDetailsSource adds HTTP request metadata to the
             * authentication object (remote address, session ID).
             * Useful for audit logging and anomaly detection.
             */
            authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

            // Set in SecurityContextHolder — this is what makes the request "authenticated".
            // The context is thread-local, so it's isolated to this request's thread.
            SecurityContextHolder.getContext().setAuthentication(authToken);

        } catch (Exception e) {
            // Any unexpected exception during user loading — log and continue without auth.
            // This is fail-open for the filter itself; the endpoint auth rules will reject.
            log.error("Failed to set user authentication in security context: {}", e.getMessage());
        }

        // Step 6: Always pass to the next filter, regardless of auth outcome.
        filterChain.doFilter(request, response);
    }

    /**
     * Extracts the raw JWT string from the Authorization header.
     * Expects format: "Bearer eyJhbGc..."
     *
     * @return The raw token string, or null if header is missing/malformed.
     */
    private String extractTokenFromRequest(HttpServletRequest request) {
        String authHeader = request.getHeader(AUTHORIZATION_HEADER);

        // StringUtils.hasText() checks for non-null, non-empty, non-whitespace.
        if (StringUtils.hasText(authHeader) && authHeader.startsWith(BEARER_PREFIX)) {
            return authHeader.substring(BEARER_PREFIX.length());
        }

        return null;
    }

    /**
     * Loads a user's email by their UUID.
     * This method exists because UserDetailsService uses email as the key,
     * but our JWT contains only the userId.
     *
     * ⚠️ This causes a DB lookup on every authenticated request.
     * Optimization (Phase 6): add email claim to JWT to avoid this.
     */
    private String loadEmailByUserId(UUID userId) {
        // We need to access the repository to get the email.
        // We load via UserDetailsService to reuse the transaction.
        // A cleaner solution is injecting UserRepository directly here.
        // We'll refactor in Phase 6 when we add caching.
        return userDetailsService.loadUserByEmail(userId);
    }
}
