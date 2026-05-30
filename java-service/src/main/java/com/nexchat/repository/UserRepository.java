/**
 * NexChat — User Repository
 *
 * Spring Data JPA automatically generates the implementation of this interface
 * at application startup. No SQL or JDBC code required for standard operations.
 *
 * Extends JpaRepository<User, UUID>:
 *   - User: the entity type
 *   - UUID: the primary key type
 *
 * JpaRepository gives us: save(), findById(), findAll(), delete(),
 * existsById(), count(), and more — all out of the box.
 */
package com.nexchat.repository;

import com.nexchat.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    /*
     * Derived query: Spring parses "findByEmail" → SELECT u FROM User u WHERE u.email = ?1
     *
     * Returns Optional<User> — never null. Forces the caller to handle the
     * "user not found" case explicitly. This is idiomatic Java 8+ code.
     *
     * Used by: UserDetailsServiceImpl (Spring Security authentication),
     *          AuthService (login flow)
     */
    Optional<User> findByEmail(String email);

    /*
     * Used for username uniqueness check during registration.
     * Exists queries are more efficient than findBy — they stop at the first
     * matching row and return a boolean (no entity hydration needed).
     */
    boolean existsByEmail(String email);

    boolean existsByUsername(String username);

    /*
     * @Query with JPQL: used when derived queries become unreadable.
     * JPQL references entity field names (passwordHash), not column names (password_hash).
     *
     * @Modifying: required for UPDATE/DELETE JPQL queries. Without it, Spring
     * treats the query as a SELECT and throws an exception.
     *
     * @Transactional: UPDATE queries require a transaction. We annotate here
     * (in addition to the service layer) as a safety net.
     *
     * Used by: AuthService when a user changes their password.
     */
    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.passwordHash = :passwordHash, u.updatedAt = :updatedAt WHERE u.id = :userId")
    int updatePasswordHash(
        @Param("userId") UUID userId,
        @Param("passwordHash") String passwordHash,
        @Param("updatedAt") Instant updatedAt
    );

    /*
     * Updates last_seen timestamp. Called by the Go service via REST when
     * a user's WebSocket connection closes.
     *
     * Returns int (rows affected) — good practice for update queries.
     * 0 means user not found; 1 means updated. Anything else is a bug.
     */
    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.lastSeen = :lastSeen WHERE u.id = :userId")
    int updateLastSeen(
        @Param("userId") UUID userId,
        @Param("lastSeen") Instant lastSeen
    );

    /**
     * Returns all users except the current user.
     * Used to populate the contacts sidebar when no search query is provided.
     * Ordered by username for consistent display.
     */
    @Query("SELECT u FROM User u WHERE u.id <> :excludeId ORDER BY u.username ASC")
    List<User> findAllExcept(@Param("excludeId") UUID excludeId);

    /**
     * Case-insensitive username prefix search.
     * Uses LOWER() + LIKE for portability across DBs.
     * PostgreSQL's ILIKE would be faster, but JPQL LOWER+LIKE works on all JPA providers.
     *
     * @param query     The search string (partial username)
     * @param excludeId The current user's ID — exclude from results
     */
    @Query("SELECT u FROM User u WHERE LOWER(u.username) LIKE LOWER(CONCAT('%', :query, '%')) AND u.id <> :excludeId ORDER BY u.username ASC")
    List<User> searchByUsername(
        @Param("query") String query,
        @Param("excludeId") UUID excludeId
    );
}
