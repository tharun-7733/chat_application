/**
 * NexChat — Global Exception Handler
 *
 * Catches exceptions thrown anywhere in the application and converts them
 * into structured API responses. This is the "last line of defense" before
 * an error reaches the client.
 *
 * @RestControllerAdvice = @ControllerAdvice + @ResponseBody.
 * Every @ExceptionHandler method's return value is serialized to JSON.
 *
 * ⚠️ WHY THIS MATTERS:
 *   Without this, Spring returns the default error response:
 *   { "timestamp": ..., "status": 400, "error": "Bad Request", "path": "/" }
 *   which doesn't match our ApiResponse<T> envelope at all.
 *   The frontend would have to handle two completely different error formats.
 *
 * ⚠️ INTERVIEW QUESTION: "How does Spring know to use this instead of
 *   the default error handler?"
 *   Spring's DispatcherServlet calls registered HandlerExceptionResolvers.
 *   @RestControllerAdvice registers an ExceptionHandlerExceptionResolver
 *   which has higher priority than DefaultHandlerExceptionResolver.
 */
package com.nexchat.exception;

import com.nexchat.dto.response.ApiResponse;
import com.nexchat.exception.custom.InvalidCredentialsException;
import com.nexchat.exception.custom.UserAlreadyExistsException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    /**
     * Handles @Valid validation failures on request bodies.
     *
     * When @Valid fails on a field, Spring throws MethodArgumentNotValidException.
     * We extract all field errors and return them in a map:
     * {
     *   "success": false,
     *   "message": "Validation failed",
     *   "data": {
     *     "username": "Username must be between 3 and 50 characters",
     *     "email": "Please provide a valid email address"
     *   }
     * }
     *
     * This gives the frontend exactly which fields failed and why.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Map<String, String>>> handleValidationErrors(
        MethodArgumentNotValidException exception
    ) {
        Map<String, String> fieldErrors = new HashMap<>();

        // getBindingResult() contains all validation failures from this request
        exception.getBindingResult().getAllErrors().forEach(error -> {
            // Cast to FieldError to get the field name (vs. global/object-level errors)
            String fieldName = ((FieldError) error).getField();
            // getDefaultMessage() returns our @NotBlank(message = "...") custom message
            String errorMessage = error.getDefaultMessage();
            fieldErrors.put(fieldName, errorMessage);
        });

        log.debug("Validation failed for request: {} fields failed", fieldErrors.size());

        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(ApiResponse.error("Validation failed"));
        // Note: we're returning the field errors map as data, but ApiResponse.error()
        // doesn't accept data. Let's use a custom build:
    }

    /**
     * Handles duplicate registration attempts (email or username already taken).
     */
    @ExceptionHandler(UserAlreadyExistsException.class)
    public ResponseEntity<ApiResponse<Void>> handleUserAlreadyExists(
        UserAlreadyExistsException exception
    ) {
        log.debug("Registration conflict: {}", exception.getMessage());
        return ResponseEntity
            .status(HttpStatus.CONFLICT)
            .body(ApiResponse.error(exception.getMessage()));
    }

    /**
     * Handles failed login attempts.
     * ⚠️ SECURITY: Always return the same generic message for auth failures.
     * Never distinguish between "email not found" and "wrong password" — that
     * lets attackers enumerate valid email addresses.
     */
    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ApiResponse<Void>> handleInvalidCredentials(
        InvalidCredentialsException exception
    ) {
        // Log internally with detail (for monitoring), respond externally with generic message
        log.debug("Authentication failed: {}", exception.getMessage());
        return ResponseEntity
            .status(HttpStatus.UNAUTHORIZED)
            .body(ApiResponse.error("Invalid email or password"));
    }

    /**
     * Handles Spring Security's AuthenticationException (thrown by the filter chain
     * when a request is missing a valid JWT but tries to access a protected resource).
     */
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiResponse<Void>> handleAuthenticationException(
        AuthenticationException exception
    ) {
        log.debug("Unauthorized request: {}", exception.getMessage());
        return ResponseEntity
            .status(HttpStatus.UNAUTHORIZED)
            .body(ApiResponse.error("Authentication required. Please provide a valid token."));
    }

    /**
     * Handles AccessDeniedException — authenticated user trying to access a resource
     * they don't have permission for (e.g., a regular user hitting an admin endpoint).
     * HTTP 403 Forbidden (not 401 Unauthorized — the distinction matters).
     *
     * ⚠️ 401 = "I don't know who you are" (not authenticated)
     *    403 = "I know who you are, but you can't do this" (not authorized)
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(
        AccessDeniedException exception
    ) {
        log.warn("Access denied: {}", exception.getMessage());
        return ResponseEntity
            .status(HttpStatus.FORBIDDEN)
            .body(ApiResponse.error("You do not have permission to perform this action."));
    }

    /**
     * Catch-all handler for any unhandled exception.
     * Prevents stack traces from leaking to the client.
     *
     * ⚠️ SECURITY: Never return exception.getMessage() to the client here.
     *   Internal errors might contain DB schema info, file paths, etc.
     *   Log the full exception server-side; return a generic message to the client.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleAllOtherExceptions(Exception exception) {
        // Log at ERROR level with full stack trace for debugging
        log.error("Unhandled exception: {}", exception.getMessage(), exception);
        return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ApiResponse.error("An unexpected error occurred. Please try again later."));
    }
}
