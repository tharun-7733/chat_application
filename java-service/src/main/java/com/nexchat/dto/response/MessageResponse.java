/**
 * NexChat — Message Response DTO
 *
 * Returned by POST /internal/messages after successful persistence.
 * Includes the DB-assigned UUID and sentAt timestamp so the Go service
 * can embed them in the WebSocket message payload delivered to clients.
 */
package com.nexchat.dto.response;

import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Getter
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class MessageResponse {

    private UUID id;
    private UUID senderId;
    private UUID receiverId;
    private String content;
    private Instant sentAt;
    private String status;
}
