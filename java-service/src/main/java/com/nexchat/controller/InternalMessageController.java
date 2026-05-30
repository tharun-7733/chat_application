/**
 * NexChat — Internal Message Controller
 *
 * Service-to-service endpoint called exclusively by the Go WebSocket service.
 * Not exposed to end users — secured by X-Internal-Token header.
 *
 * Why a separate controller instead of reusing AuthController?
 *   - Clean separation of concerns: auth vs messaging
 *   - Easier to restrict to internal network in production (by IP / service mesh)
 *   - Clear audit trail: all DB message writes flow through here
 *
 * Security model:
 *   - Endpoint is at /internal/messages (under /api/internal/**)
 *   - SecurityConfig permits /api/internal/** without JWT (no user context needed)
 *   - We validate X-Internal-Token header against INTERNAL_SECRET env var
 *   - In production: add IP allow-list (Go service IP only) via firewall rules
 */
package com.nexchat.controller;

import com.nexchat.dto.request.SendMessageRequest;
import com.nexchat.dto.response.ApiResponse;
import com.nexchat.dto.response.MessageResponse;
import com.nexchat.entity.Message;
import com.nexchat.repository.MessageRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/internal/messages")
@RequiredArgsConstructor
@Slf4j
public class InternalMessageController {

    private final MessageRepository messageRepository;

    @Value("${nexchat.internal.secret:nexchat-internal-dev-secret}")
    private String internalSecret;

    /**
     * POST /internal/messages
     *
     * Called by Go service after delivering a message over WebSocket.
     * Persists the message to PostgreSQL and returns the assigned ID + sentAt.
     *
     * @param token   The X-Internal-Token header (must match INTERNAL_SECRET)
     * @param request The message payload {senderId, receiverId, content}
     */
    @PostMapping
    public ResponseEntity<ApiResponse<MessageResponse>> saveMessage(
        @RequestHeader(value = "X-Internal-Token", required = false) String token,
        @Valid @RequestBody SendMessageRequest request
    ) {
        // Validate internal token
        if (!internalSecret.equals(token)) {
            log.warn("[internal] rejected request with invalid token from IP");
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error("Invalid internal token"));
        }

        // Persist the message
        Message message = Message.builder()
            .senderId(request.getSenderId())
            .receiverId(request.getReceiverId())
            .content(request.getContent())
            .messageType("TEXT")
            .build();

        Message saved = messageRepository.save(message);

        log.debug("[internal] message persisted: id={} sender={} receiver={}",
            saved.getId(), saved.getSenderId(), saved.getReceiverId());

        MessageResponse response = MessageResponse.builder()
            .id(saved.getId())
            .senderId(saved.getSenderId())
            .receiverId(saved.getReceiverId())
            .content(saved.getContent())
            .sentAt(saved.getSentAt())
            .status("delivered")
            .build();

        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Message saved", response));
    }
}
