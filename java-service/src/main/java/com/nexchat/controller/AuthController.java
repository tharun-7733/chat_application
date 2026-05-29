/**
 * NexChat — Authentication Controller
 *
 * REST API entry point for auth operations. This controller is intentionally
 * thin — it handles HTTP concerns (request parsing, response codes) and
 * delegates ALL business logic to AuthService.
 *
 * Base URL: /api/auth (declared at class level via @RequestMapping)
 *
 * Endpoints:
 *   POST /api/auth/register → register a new account
 *   POST /api/auth/login    → login and receive tokens
 *   POST /api/auth/refresh  → exchange refresh token for new access token
 *   POST /api/auth/logout   → invalidate refresh token session
 *
 * Rate limiting: Applied via RateLimitInterceptor (configured in Phase 1 step 2)
 * All endpoints in /api/auth/** are publicly accessible (no JWT required).
 */
package com.nexchat.controller;

import com.nexchat.dto.request.LoginRequest;
import com.nexchat.dto.request.RegisterRequest;
import com.nexchat.dto.response.ApiResponse;
import com.nexchat.dto.response.AuthResponse;
import com.nexchat.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
/*
 * @RestController = @Controller + @ResponseBody
 * Every method return value is automatically serialized to JSON.
 * This is the standard annotation for REST APIs in Spring Boot.
 */
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthService authService;

    /**
     * POST /api/auth/register
     *
     * Registers a new user account and returns JWT tokens.
     *
     * @Valid triggers Bean Validation on the RegisterRequest body.
     *   If validation fails, MethodArgumentNotValidException is thrown
     *   and caught by GlobalExceptionHandler → 400 Bad Request.
     *
     * HTTP 201 Created: appropriate for resource creation (RESTful convention).
     *   Most auth endpoints return 200, but 201 is semantically correct for register.
     *
     * @RequestBody: tells Spring to deserialize the JSON request body into
     *   RegisterRequest using Jackson. Without @RequestBody, it would try
     *   to bind from query parameters (wrong).
     */
    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(
        @Valid @RequestBody RegisterRequest request
    ) {
        log.debug("Registration request received for username: {}", request.getUsername());
        // ⚠️ Never log the password or email at INFO level (PII + security)

        AuthResponse authResponse = authService.register(request);

        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(ApiResponse.success("Registration successful. Welcome to NexChat!", authResponse));
    }

    /**
     * POST /api/auth/login
     *
     * Authenticates a user and returns JWT tokens.
     * Returns 200 OK (not 201 — we're not creating a resource, just authenticating).
     */
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(
        @Valid @RequestBody LoginRequest request
    ) {
        log.debug("Login attempt received");
        // ⚠️ Never log the email at INFO level — PII concern

        AuthResponse authResponse = authService.login(request);

        return ResponseEntity.ok(
            ApiResponse.success("Login successful", authResponse)
        );
    }

    /**
     * GET /api/auth/health
     * Simple health check for the auth service.
     * Useful for smoke testing after deployment.
     *
     * ⚠️ This is different from /actuator/health — this one verifies
     *   that the auth controller is reachable and Spring context is up.
     */
    @GetMapping("/health")
    public ResponseEntity<ApiResponse<String>> health() {
        return ResponseEntity.ok(
            ApiResponse.success("Auth service is running", "OK")
        );
    }
}
