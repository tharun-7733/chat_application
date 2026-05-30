/**
 * NexChat — Message Entity
 *
 * Maps to the 'messages' table (created by V4__create_messages_table.sql).
 * Messages are immutable once written — no updatedAt column.
 *
 * Note: sender_id has ON DELETE SET NULL, so sender can be null after user deletion.
 */
package com.nexchat.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "messages")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /**
     * The UUID of the user who sent the message.
     * ON DELETE SET NULL in DB — can be null if sender account was deleted.
     */
    @Column(name = "sender_id", nullable = false)
    private UUID senderId;

    /**
     * The UUID of the user who receives the message.
     */
    @Column(name = "receiver_id", nullable = false)
    private UUID receiverId;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.NAMED_ENUM)
    @Column(name = "message_type", nullable = false, columnDefinition = "message_type")
    @Builder.Default
    private MessageType messageType = MessageType.TEXT;

    /**
     * Message type enum matching the PostgreSQL 'message_type' enum.
     */
    public enum MessageType {
        TEXT, IMAGE, FILE, VOICE, SYSTEM
    }

    @Column(name = "is_read", nullable = false)
    @Builder.Default
    private boolean isRead = false;

    @Column(name = "sent_at", nullable = false)
    private Instant sentAt;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Column(name = "read_at")
    private Instant readAt;

    @PrePersist
    protected void onPersist() {
        if (this.sentAt == null) {
            this.sentAt = Instant.now();
        }
    }

}
