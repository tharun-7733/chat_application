/**
 * NexChat — User Entity
 *
 * Maps to the 'users' table. Implements UserDetails so Spring Security can
 * use this entity directly for authentication — no adapter class needed.
 *
 * This is the core identity object in the system. Every other entity (sessions,
 * friends, messages) references this via UUID foreign key.
 */
package com.nexchat.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

@Entity
@Table(
    name = "users",
    /*
     * uniqueConstraints on the @Table level produce proper DDL-level constraints.
     * But since Flyway manages our schema (not Hibernate's DDL), these are
     * documentation for developers and for Hibernate's schema VALIDATION.
     * Hibernate will check these match the real DB on startup.
     */
    uniqueConstraints = {
        @UniqueConstraint(name = "uq_users_email",    columnNames = "email"),
        @UniqueConstraint(name = "uq_users_username", columnNames = "username")
    }
)
@Getter
@Setter
@Builder
/*
 * @NoArgsConstructor: JPA specification REQUIRES a no-arg constructor.
 *   Hibernate uses it via reflection to instantiate entities when loading from DB.
 *   Without it, you'll get an InstantiationException at runtime.
 *
 * @AllArgsConstructor: Required because @Builder generates an all-args constructor
 *   internally, but making it explicit allows us to control visibility.
 *
 * ⚠️ COMMON MISTAKE: Using only @Builder without @NoArgsConstructor.
 *   Works fine for creates, blows up when Hibernate tries to load existing records.
 */
@NoArgsConstructor
@AllArgsConstructor
public class User extends BaseEntity implements UserDetails {

    @Column(name = "username", nullable = false, length = 50)
    private String username;

    @Column(name = "email", nullable = false, length = 255)
    private String email;

    /*
     * The BCrypt hash of the user's password.
     * BCrypt output is always 60 characters.
     * We NEVER store or log the plaintext password anywhere.
     */
    @Column(name = "password_hash", nullable = false, length = 60)
    private String passwordHash;

    @Column(name = "avatar_url", length = 500)
    private String avatarUrl;

    @Column(name = "status_message", length = 150)
    private String statusMessage;

    /*
     * last_seen is updated by the Go WebSocket service when a user disconnects.
     * The Java service only reads this for profile responses.
     */
    @Column(name = "last_seen")
    private Instant lastSeen;

    // =========================================================================
    // UserDetails interface — required by Spring Security
    // =========================================================================

    /*
     * Authorities define what roles/permissions the user has.
     * For now, everyone is ROLE_USER. In Phase 6, we could add ROLE_ADMIN.
     *
     * ⚠️ SPRING SECURITY CONVENTION: Authority strings must start with "ROLE_"
     *   when using hasRole(). If you use hasAuthority(), no prefix needed.
     */
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_USER"));
    }

    /*
     * UserDetails requires getPassword(), but our field is named passwordHash.
     * We override and return passwordHash — Spring Security uses this for
     * BCrypt comparison during authentication.
     */
    @Override
    public String getPassword() {
        return this.passwordHash;
    }

    /*
     * The following methods are part of the UserDetails contract for account
     * state management. We return true for all — we'll implement account
     * locking/suspension in Phase 6. Returning false here prevents login.
     */
    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
