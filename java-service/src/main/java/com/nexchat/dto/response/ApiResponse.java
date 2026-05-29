/**
 * NexChat — API Response Wrapper
 *
 * A consistent envelope for ALL API responses (success and error).
 * This is the "response envelope" pattern used by major APIs (GitHub, Stripe, etc.).
 *
 * Every response the frontend receives has the same shape:
 * {
 *   "success": true,
 *   "message": "Registration successful",
 *   "data": { ... },
 *   "timestamp": "2024-01-01T10:00:00Z"
 * }
 *
 * ⚠️ WHY THIS MATTERS:
 *   Without an envelope, your API returns inconsistent shapes:
 *   - Success: { "id": "...", "username": "..." }
 *   - Error:   { "error": "...", "status": 400 }
 *   The frontend has to handle two completely different patterns.
 *   With an envelope: always the same shape, just different 'data' and 'success'.
 */
package com.nexchat.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;

import java.time.Instant;

/*
 * @JsonInclude(NON_NULL): Jackson will omit null fields from the JSON output.
 * This keeps responses clean — if 'data' is null (error response), it won't
 * appear as "data": null in the JSON.
 */
@Getter
@Builder
@AllArgsConstructor
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {

    private boolean success;
    private String message;
    private T data;

    @Builder.Default
    private Instant timestamp = Instant.now();

    // Static factory methods for clean call sites:
    // ApiResponse.success("Registration successful", authResponse)
    // ApiResponse.error("Email already exists")

    public static <T> ApiResponse<T> success(String message, T data) {
        return ApiResponse.<T>builder()
            .success(true)
            .message(message)
            .data(data)
            .build();
    }

    public static <T> ApiResponse<T> success(String message) {
        return ApiResponse.<T>builder()
            .success(true)
            .message(message)
            .build();
    }

    public static <T> ApiResponse<T> error(String message) {
        return ApiResponse.<T>builder()
            .success(false)
            .message(message)
            .build();
    }
}
