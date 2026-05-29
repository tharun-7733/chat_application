/**
 * NexChat — Base Entity (Mapped Superclass)
 *
 * Provides common auditing fields shared across all entities.
 * @MappedSuperclass means: "map these fields to the table, but this class
 * itself is NOT an entity (no table for BaseEntity itself)."
 *
 * Using @EntityListeners(AuditingEntityListener.class) with @EnableJpaAuditing
 * would auto-populate createdAt/updatedAt. We use @PrePersist/@PreUpdate
 * here to avoid requiring @EnableJpaAuditing — simpler, fewer Spring annotations.
 */
package com.nexchat.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@MappedSuperclass
@Getter
@Setter
public abstract class BaseEntity {

    /*
     * UUIDs as primary keys: We let PostgreSQL generate them (gen_random_uuid()).
     * Strategy.IDENTITY would use a DB sequence, but for UUIDs we use AUTO
     * which defers to Hibernate's UUID generator — also fine.
     *
     * ⚠️ INTERVIEW QUESTION: "Why Instant over LocalDateTime?"
     *   Instant is a point in time on the global timeline (UTC-based).
     *   LocalDateTime has no timezone info — it's ambiguous in a distributed system.
     *   Always use Instant or ZonedDateTime for timestamps stored in the DB.
     */
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "created_at", updatable = false, nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /*
     * @PrePersist: JPA lifecycle callback — called by Hibernate just before
     * it executes the INSERT statement. Guaranteed to run once.
     *
     * @PreUpdate: Called just before Hibernate executes an UPDATE statement.
     * Note: this only fires if Hibernate detects a change to the entity (dirty checking).
     */
    @PrePersist
    protected void onPersist() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = Instant.now();
    }
}
