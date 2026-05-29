/**
 * NexChat — Login Request DTO
 *
 * Represents the incoming payload for POST /api/auth/login.
 * Intentionally simpler than RegisterRequest — login is just email + password.
 */
package com.nexchat.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LoginRequest {

    @NotBlank(message = "Email is required")
    @Email(message = "Please provide a valid email address")
    private String email;

    /*
     * Note: we do NOT enforce password complexity here (no @Pattern).
     * During login, the user provides their existing password which is
     * compared against the stored BCrypt hash. Rejecting it for not meeting
     * "current" complexity rules would lock out users with old passwords.
     *
     * ⚠️ SECURITY: We still validate @NotBlank to prevent empty-string
     *   auth bypass attempts.
     */
    @NotBlank(message = "Password is required")
    private String password;
}
