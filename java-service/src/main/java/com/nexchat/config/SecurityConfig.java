/**
 * NexChat — Spring Security Configuration
 *
 * Defines the SecurityFilterChain (the access control rules) and
 * exposes the core security beans needed throughout the application.
 *
 * Spring Security 6 (Spring Boot 3.x) Changes:
 *   ✅ Use @Bean SecurityFilterChain — NOT WebSecurityConfigurerAdapter
 *   ✅ Use requestMatchers() — NOT antMatchers() (deprecated & removed)
 *   ✅ Lambdas for DSL — NOT method chaining on HttpSecurity directly
 *
 * ⚠️ INTERVIEW QUESTION: "What's the difference between Authentication
 *   and Authorization in Spring Security?"
 *   Authentication: proving identity (who are you?) — handled by filters
 *   Authorization: enforcing permissions (what can you do?) — handled by
 *   FilterSecurityInterceptor / method security
 */
package com.nexchat.config;

import com.nexchat.security.JwtAuthFilter;
import com.nexchat.security.UserDetailsServiceImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
/*
 * @EnableMethodSecurity: enables @PreAuthorize, @PostAuthorize on methods.
 * Example: @PreAuthorize("hasRole('ADMIN')") on an admin-only endpoint.
 * We'll use this in Phase 4 for admin features. Enabling it now costs nothing.
 */
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final UserDetailsServiceImpl userDetailsService;

    /*
     * CORS allowed origins. In production, this should be your actual frontend
     * domain, NOT "*". We read from environment to support different envs.
     */
    @Value("${FRONTEND_URL:http://localhost:5173}")
    private String frontendUrl;

    /**
     * The SecurityFilterChain bean — this IS the security configuration.
     *
     * Order matters: rules are evaluated top-to-bottom, first match wins.
     * Always put more specific rules before broader ones.
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            /*
             * CSRF (Cross-Site Request Forgery) protection:
             * DISABLED because we use stateless JWT authentication.
             *
             * CSRF attacks exploit cookies — an attacker tricks the user's browser
             * into making a request with their session cookie. Since we don't use
             * cookies for auth (we use Authorization header with JWT), CSRF doesn't apply.
             *
             * ⚠️ If you ever switch to cookie-based auth, re-enable CSRF!
             */
            .csrf(AbstractHttpConfigurer::disable)

            /*
             * CORS (Cross-Origin Resource Sharing):
             * Required because the React frontend (localhost:5173) is a different
             * origin than the Java backend (localhost:8080).
             *
             * Without this, browsers block all requests with a CORS error.
             */
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))

            /*
             * Authorization rules: which endpoints require authentication.
             *
             * requestMatchers().permitAll() = no auth required (public endpoints)
             * anyRequest().authenticated() = everything else needs a valid JWT
             *
             * ⚠️ Order matters: more specific rules first, anyRequest() last.
             */
            .authorizeHttpRequests(auth -> auth
                // Auth endpoints are public — you can't require auth to log in!
                .requestMatchers("/api/auth/**").permitAll()
                // Actuator health endpoint — needed for Docker health checks
                .requestMatchers("/actuator/health").permitAll()
                // Internal endpoint for Go service to call (service-to-service)
                // We'll add IP-based restriction in Phase 5
                .requestMatchers("/api/internal/**").permitAll()
                // All other endpoints require a valid JWT access token
                .anyRequest().authenticated()
            )

            /*
             * Session Management: STATELESS.
             * Spring Security will not create or use HTTP sessions.
             * Each request must carry its own credentials (JWT in Authorization header).
             * This is the correct setting for any JWT-based API.
             */
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            )

            /*
             * Authentication Provider: tells Spring Security HOW to authenticate.
             * DaoAuthenticationProvider uses:
             *   1. UserDetailsService to load the user by email
             *   2. PasswordEncoder to verify the password hash
             */
            .authenticationProvider(authenticationProvider())

            /*
             * Register our JWT filter BEFORE Spring's own auth filter.
             * This ensures every request is checked for a JWT before Spring
             * attempts its own form-based or basic authentication.
             *
             * addFilterBefore(ourFilter, BeforeThisFilter.class)
             */
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * CORS Configuration Source.
     *
     * These rules control which external origins, methods, and headers are
     * allowed to make cross-origin requests to our API.
     *
     * ⚠️ PRODUCTION CHECKLIST:
     *   - Replace "*" allowed headers with explicit list in production
     *   - Replace allowedOrigins with your exact frontend domain
     *   - Set maxAge to cache preflight responses (reduce preflight requests)
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        // Allowed origins: only our React frontend
        config.setAllowedOrigins(List.of(frontendUrl));

        // HTTP methods the frontend is allowed to use
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));

        // Headers the frontend can include in requests
        // Authorization: for JWT, Content-Type: for JSON bodies
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Requested-With"));

        // Headers the frontend is allowed to read from responses
        // Authorization: some clients need to read a new token from a response header
        config.setExposedHeaders(List.of("Authorization"));

        // Allow credentials (cookies, Authorization header) in CORS requests
        config.setAllowCredentials(true);

        // Cache preflight response for 1 hour — reduces browser preflight requests
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    /**
     * DaoAuthenticationProvider: the authentication mechanism.
     *
     * DaoAuthenticationProvider uses a UserDetailsService + PasswordEncoder.
     * When AuthenticationManager.authenticate() is called:
     *   1. Calls userDetailsService.loadUserByUsername(email)
     *   2. Calls passwordEncoder.matches(rawPassword, storedHash)
     *   3. Returns an authenticated Authentication object (or throws)
     */
    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        /*
         * hideUserNotFoundExceptions(true) is the DEFAULT.
         * This converts UsernameNotFoundException → BadCredentialsException.
         * Prevents user enumeration: attacker can't tell if the email exists.
         */
        provider.setHideUserNotFoundExceptions(true);
        return provider;
    }

    /**
     * BCryptPasswordEncoder — the password hashing algorithm.
     *
     * BCrypt properties:
     * - Adaptive: work factor (strength) can be increased as hardware gets faster
     * - Salted: each hash includes a random salt, preventing rainbow table attacks
     * - Slow by design: ~100ms per hash — annoying for attackers, fine for users
     *
     * Strength 12 (2^12 = 4096 iterations) is the current recommendation.
     * Default is 10. Higher = slower. 14+ is too slow for a web API.
     *
     * ⚠️ INTERVIEW QUESTION: "Why is slow hashing good for passwords?"
     *   If an attacker gets your DB, they need to brute-force the hashes.
     *   BCrypt at strength 12 means ~100ms/attempt on modern hardware.
     *   At 1 billion/second for MD5, BCrypt makes cracking 10 million times harder.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    /**
     * AuthenticationManager — the orchestrator.
     *
     * AuthenticationManager.authenticate() is what you call to trigger the
     * full authentication flow. It delegates to the registered
     * AuthenticationProvider(s).
     *
     * We expose this as a bean so AuthService can inject and use it.
     * Spring Boot auto-configures this from AuthenticationConfiguration.
     */
    @Bean
    public AuthenticationManager authenticationManager(
        AuthenticationConfiguration config
    ) throws Exception {
        return config.getAuthenticationManager();
    }
}
