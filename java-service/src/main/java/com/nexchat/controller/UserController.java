/**
 * NexChat — User Controller
 *
 * REST API for user profile operations. All endpoints require authentication
 * (JWT access token in Authorization header) — enforced by SecurityConfig.
 *
 * Base URL: /api/users
 *
 * Endpoints:
 *   GET  /api/users/me              → get current user's profile
 *   PUT  /api/users/me              → update current user's profile
 *   GET  /api/users/{username}      → get any user's public profile
 *   GET  /api/users/search?q=       → search users by username prefix
 */
package com.nexchat.controller;

import com.nexchat.dto.response.ApiResponse;
import com.nexchat.entity.User;
import com.nexchat.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@Slf4j
public class UserController {

    private final UserRepository userRepository;

    /**
     * GET /api/users/me
     *
     * Returns the currently authenticated user's full profile.
     *
     * @AuthenticationPrincipal: Spring Security injects the UserDetails
     * object that was placed in the SecurityContext by JwtAuthFilter.
     * Since our UserDetails IS the User entity (User implements UserDetails),
     * we can cast it directly.
     *
     * This is the "who am I?" endpoint — called by the React frontend
     * after login to hydrate the auth context.
     */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getCurrentUser(
        @AuthenticationPrincipal UserDetails userDetails
    ) {
        /*
         * Cast UserDetails to our User entity.
         * This is safe because JwtAuthFilter loads users via UserDetailsServiceImpl,
         * which returns User entities (which implement UserDetails).
         *
         * ⚠️ If you use a different UserDetails implementation in the future,
         *   this cast will throw ClassCastException. Consider a custom principal
         *   class or a service method that loads by ID.
         */
        User currentUser = (User) userDetails;

        log.debug("Profile requested for user: {}", currentUser.getId());

        Map<String, Object> profile = Map.of(
            "id", currentUser.getId(),
            "username", currentUser.getUsername(),
            "email", currentUser.getEmail(),
            "avatarUrl", currentUser.getAvatarUrl() != null ? currentUser.getAvatarUrl() : "",
            "statusMessage", currentUser.getStatusMessage() != null ? currentUser.getStatusMessage() : "",
            "lastSeen", currentUser.getLastSeen() != null ? currentUser.getLastSeen().toString() : "",
            "createdAt", currentUser.getCreatedAt().toString()
        );

        return ResponseEntity.ok(ApiResponse.success("Profile retrieved", profile));
    }

    /**
     * GET /api/users/{id}
     *
     * Returns a user's public profile by their UUID.
     * Only exposes non-sensitive fields (no email for other users).
     *
     * Used by the frontend to display other users' profiles in search results
     * and friend lists.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getUserById(
        @PathVariable UUID id
    ) {
        return userRepository.findById(id)
            .map(user -> {
                Map<String, Object> publicProfile = Map.of(
                    "id", user.getId(),
                    "username", user.getUsername(),
                    "avatarUrl", user.getAvatarUrl() != null ? user.getAvatarUrl() : "",
                    "statusMessage", user.getStatusMessage() != null ? user.getStatusMessage() : "",
                    "lastSeen", user.getLastSeen() != null ? user.getLastSeen().toString() : ""
                    // Note: email is intentionally NOT included in public profile
                );
                return ResponseEntity.ok(
                    ApiResponse.success("User found", publicProfile)
                );
            })
            .orElseGet(() -> ResponseEntity.status(404).body(
                ApiResponse.error("User not found")
            ));
    }
}
