/**
 * NexChat — User Already Exists Exception
 * Thrown when a registration attempt uses an email or username already in use.
 */
package com.nexchat.exception.custom;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/*
 * @ResponseStatus: When this exception propagates to the controller, Spring
 * automatically responds with HTTP 409 Conflict. Our GlobalExceptionHandler
 * overrides this with a structured response body.
 */
@ResponseStatus(HttpStatus.CONFLICT)
public class UserAlreadyExistsException extends RuntimeException {

    public UserAlreadyExistsException(String message) {
        super(message);
    }
}
