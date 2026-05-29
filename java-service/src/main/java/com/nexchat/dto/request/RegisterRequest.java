/**
 * NexChat — Register Request DTO
 *
 * Represents the incoming payload for POST /api/auth/register.
 * Bean Validation annotations enforce constraints BEFORE the request
 * reaches service layer code — fail fast at the boundary.
 *
 * Record vs Class: We use a class (not a Java record) here because:
 * 1. Lombok's @Builder works seamlessly with classes
 * 2. Bean Validation works with records but IDE support can be spotty
 * 3. More familiar pattern for Spring Boot developers
 */
package com.nexchat.dto.request;

import jakarta.validation.constraints.*;
import lombok.*;

@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RegisterRequest {

    /*
     * @NotBlank: fails if null, empty "", or whitespace "   ".
     * @NotNull would pass for "   ". Always use @NotBlank for strings.
     *
     * @Size: applied AFTER @NotBlank check. Checks the trimmed length.
     * message: the error message returned in the validation error response.
     *
     * ⚠️ COMMON MISTAKE: @NotEmpty passes for "   " (whitespace).
     *   Use @NotBlank for user-input strings. Always.
     */
    @NotBlank(message = "Username is required")
    @Size(min = 3, max = 50, message = "Username must be between 3 and 50 characters")
    /*
     * @Pattern: enforces only alphanumeric + underscore/hyphen.
     * Why? Prevents SQL injection via username, prevents XSS via displayed names,
     * and makes usernames URL-safe (e.g., /profile/john_doe).
     */
    @Pattern(
        regexp = "^[a-zA-Z0-9_-]+$",
        message = "Username can only contain letters, numbers, underscores, and hyphens"
    )
    private String username;

    @NotBlank(message = "Email is required")
    @Email(message = "Please provide a valid email address")
    @Size(max = 255, message = "Email must not exceed 255 characters")
    private String email;

    /*
     * Password validation rules:
     * - @Size enforces minimum length at the DTO layer
     * - @Pattern enforces complexity (at least one uppercase, one digit)
     *
     * ⚠️ SECURITY NOTE: We validate password strength at the API layer,
     *   but we NEVER log, store, or transmit the plaintext password
     *   beyond the AuthService where it's immediately hashed.
     *
     * ⚠️ INTERVIEW QUESTION: "Where should password validation live?"
     *   At the DTO layer (format), NOT at the entity layer. The entity
     *   stores a hash — password validation has no meaning there.
     */
    @NotBlank(message = "Password is required")
    @Size(min = 8, max = 128, message = "Password must be between 8 and 128 characters")
    @Pattern(
        regexp = "^(?=.*[A-Z])(?=.*\\d).+$",
        message = "Password must contain at least one uppercase letter and one digit"
    )
    private String password;
}
