/**
 * NexChat — UserDetailsService Implementation
 *
 * Spring Security's authentication pipeline calls loadUserByUsername() when
 * processing a login attempt via UsernamePasswordAuthenticationToken.
 *
 * Despite the confusing name 'loadUserByUsername', we use the email field
 * as the identifier — because that's what users log in with.
 * The interface method name is a Spring Security historical artifact.
 *
 * Flow:
 *   AuthController.login()
 *     → AuthService.authenticate()
 *     → AuthenticationManager.authenticate()
 *     → DaoAuthenticationProvider.retrieveUser()
 *     → THIS.loadUserByUsername(email)
 *     → UserRepository.findByEmail()
 *     → BCrypt comparison
 *     → Authentication object returned
 */
package com.nexchat.security;

import com.nexchat.entity.User;
import com.nexchat.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor // Lombok: generates constructor for all final fields
@Slf4j
public class UserDetailsServiceImpl implements UserDetailsService {

    private final UserRepository userRepository;

    /**
     * Resolves a user's email from their UUID.
     * Called by JwtAuthFilter to bridge the gap between the UUID in the JWT
     * and the email-keyed UserDetailsService lookup.
     *
     * ⚠️ PHASE 6 OPTIMIZATION: Cache this result with Caffeine/Redis to
     *   avoid a DB round-trip on every authenticated request.
     */
    @Transactional(readOnly = true)
    public String loadUserByEmail(UUID userId) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new UsernameNotFoundException("User not found for id: " + userId));
        return user.getEmail();
    }

    /*
     * @Transactional(readOnly = true): Marks this as a read-only transaction.
     * Benefits:
     *   1. Hibernate skips dirty checking (no snapshot comparison) → faster
     *   2. PostgreSQL can route to read replicas if configured
     *   3. Accidental writes throw an exception → safety net
     *
     * ⚠️ This is called on EVERY authenticated request (via JwtAuthFilter).
     *   It hits the DB each time to load the user. At high scale, you'd add
     *   a cache layer here (Redis/Caffeine) with a TTL of ~5 minutes.
     */
    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        /*
         * ⚠️ SECURITY: We deliberately use a generic error message.
         * "Email not found" would tell an attacker which emails are registered.
         * "Invalid credentials" (from the caller) gives away nothing.
         *
         * However, in the SERVICE LOG, we can log the actual reason because
         * logs are internal. We still don't log the email to prevent PII in logs.
         */
        return userRepository.findByEmail(email)
            .orElseThrow(() -> {
                log.debug("Authentication attempt failed: no account found for provided email");
                // UsernameNotFoundException is Spring Security's signal to the
                // DaoAuthenticationProvider to respond with "Bad credentials".
                return new UsernameNotFoundException("User not found with email: " + email);
            });
    }
}
