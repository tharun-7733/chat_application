/**
 * NexChat — Authentication Service
 *
 * Orchestrates the registration and login flows.
 * This is the ONLY class in the system that knows how passwords are handled.
 *
 * Clean layered architecture:
 *   Controller → AuthService → (UserRepository + JwtService + PasswordEncoder)
 *
 * The service layer is where:
 *   - Business rules live (username uniqueness, password hashing)
 *   - Transaction boundaries are defined (@Transactional)
 *   - Orchestration happens (save user THEN generate tokens)
 *
 * ⚠️ The controller layer should be thin (request/response mapping only).
 *   Business logic in controllers = hard to test, hard to reuse.
 */
package com.nexchat.service;

import com.nexchat.dto.request.LoginRequest;
import com.nexchat.dto.request.RegisterRequest;
import com.nexchat.dto.response.AuthResponse;
import com.nexchat.entity.User;
import com.nexchat.exception.custom.InvalidCredentialsException;
import com.nexchat.exception.custom.UserAlreadyExistsException;
import com.nexchat.repository.UserRepository;
import com.nexchat.security.JwtService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;

    /**
     * Registers a new user account.
     *
     * Steps:
     * 1. Validate email + username uniqueness
     * 2. Hash the password with BCrypt
     * 3. Persist the user to PostgreSQL
     * 4. Generate access + refresh tokens
     * 5. Return the auth response
     *
     * @Transactional: The user save and any subsequent DB operations
     * either ALL succeed or ALL roll back. No half-created users.
     *
     * ⚠️ GOTCHA: Without @Transactional, if the JWT generation throws
     *   an exception, the user is already saved to the DB but has no tokens.
     *   @Transactional rolls back the user save automatically.
     */
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        // Step 1: Uniqueness validation
        // Check email first (primary identifier), then username.
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new UserAlreadyExistsException(
                "An account with this email already exists"
            );
        }

        if (userRepository.existsByUsername(request.getUsername())) {
            throw new UserAlreadyExistsException(
                "This username is already taken. Please choose a different one."
            );
        }

        // Step 2: Hash the password
        // passwordEncoder.encode() applies BCrypt with strength 12 (from SecurityConfig).
        // The result includes the salt embedded in the hash string.
        // ⚠️ After this line, the original password string is no longer needed.
        String passwordHash = passwordEncoder.encode(request.getPassword());

        // Step 3: Build and persist the User entity using the builder pattern.
        // Note: id, createdAt, updatedAt are set by BaseEntity @PrePersist.
        User newUser = User.builder()
            .username(request.getUsername())
            .email(request.getEmail())
            .passwordHash(passwordHash)
            // avatarUrl and statusMessage are null until the user sets them
            .build();

        User savedUser = userRepository.save(newUser);
        log.info("New user registered: id={}, username={}", savedUser.getId(), savedUser.getUsername());

        // Step 4 & 5: Generate tokens and return
        return buildAuthResponse(savedUser);
    }

    /**
     * Authenticates an existing user and returns new tokens.
     *
     * ⚠️ SECURITY FLOW:
     * We use AuthenticationManager (not PasswordEncoder directly) because:
     *   1. AuthenticationManager delegates to DaoAuthenticationProvider
     *   2. DaoAuthenticationProvider calls loadUserByUsername first
     *   3. Then calls passwordEncoder.matches(raw, hash)
     *   4. hideUserNotFoundExceptions=true converts any exception to BadCredentialsException
     *      → same response whether email doesn't exist OR password is wrong
     */
    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        try {
            /*
             * AuthenticationManager.authenticate() is the single call that:
             * 1. Loads the user by email (via UserDetailsServiceImpl)
             * 2. Verifies the password hash
             * 3. Checks isEnabled, isAccountNonLocked, etc.
             * 4. Returns an authenticated Authentication, or throws BadCredentialsException
             *
             * We throw UsernamePasswordAuthenticationToken with:
             * - principal: the email (used by loadUserByUsername)
             * - credentials: the raw password (used by BCrypt comparison)
             */
            authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                    request.getEmail(),
                    request.getPassword()
                )
            );
        } catch (BadCredentialsException e) {
            /*
             * ⚠️ SECURITY: Catch BadCredentialsException and throw our own
             * InvalidCredentialsException. This prevents leaking Spring Security
             * internal details to the client.
             *
             * Also important: we DON'T include the email in the error message
             * because it would confirm to an attacker that they have a valid email.
             */
            throw new InvalidCredentialsException("Invalid email or password");
        }

        // If we reach here, authentication succeeded.
        // Load the user to get the full entity for token generation.
        User authenticatedUser = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new InvalidCredentialsException("Invalid email or password"));

        log.info("User logged in: id={}", authenticatedUser.getId());

        return buildAuthResponse(authenticatedUser);
    }

    /**
     * Builds the AuthResponse from a User entity.
     * Centralizes token generation to avoid duplication between register and login.
     *
     * The @Transactional boundary from the calling method covers this.
     */
    private AuthResponse buildAuthResponse(User user) {
        String accessToken = jwtService.generateAccessToken(user.getId());
        String refreshToken = jwtService.generateRefreshToken(user.getId());

        // TODO Phase 4: Save refresh token hash to sessions table for revocation support.
        // For now, refresh tokens are stateless (can't be revoked before expiry).

        return AuthResponse.builder()
            .accessToken(accessToken)
            .refreshToken(refreshToken)
            .accessTokenExpiresAt(jwtService.getAccessTokenExpiresAt())
            .user(AuthResponse.UserProfile.builder()
                .id(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .avatarUrl(user.getAvatarUrl())
                .statusMessage(user.getStatusMessage())
                .build())
            .build();
    }
}
