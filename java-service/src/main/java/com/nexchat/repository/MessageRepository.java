/**
 * NexChat — Message Repository
 *
 * Spring Data JPA repository for the messages table.
 * Provides CRUD operations and custom conversation queries.
 */
package com.nexchat.repository;

import com.nexchat.entity.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface MessageRepository extends JpaRepository<Message, UUID> {

    /**
     * Fetches the conversation between two users (both directions) ordered by time.
     * Uses the composite indexes idx_messages_conversation and idx_messages_conversation_reverse.
     *
     * JPQL union workaround: PostgreSQL supports UNION, but JPQL doesn't.
     * We use OR conditions instead — the query planner uses the bitmap OR of both indexes.
     */
    @Query("""
        SELECT m FROM Message m
        WHERE (m.senderId = :userA AND m.receiverId = :userB)
           OR (m.senderId = :userB AND m.receiverId = :userA)
        ORDER BY m.sentAt ASC
        """)
    Page<Message> findConversation(
        @Param("userA") UUID userA,
        @Param("userB") UUID userB,
        Pageable pageable
    );

    /**
     * Counts unread messages sent to a specific receiver.
     */
    long countByReceiverIdAndIsReadFalse(UUID receiverId);
}
