/**
 * NexChat — Internal Message Request DTO
 *
 * Payload for POST /internal/messages — called by the Go WebSocket service
 * to persist a message to PostgreSQL after real-time delivery.
 */
package com.nexchat.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.util.UUID;

@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SendMessageRequest {

    @NotNull(message = "Sender ID is required")
    private UUID senderId;

    @NotNull(message = "Receiver ID is required")
    private UUID receiverId;

    @NotBlank(message = "Message content is required")
    @Size(max = 4000, message = "Message cannot exceed 4000 characters")
    private String content;
}
