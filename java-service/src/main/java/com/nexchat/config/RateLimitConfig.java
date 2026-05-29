/**
 * NexChat — Rate Limit Configuration
 *
 * Implements per-IP rate limiting on authentication endpoints using
 * the Token Bucket algorithm (Bucket4j library).
 *
 * Why rate limit auth endpoints specifically?
 *   - Register: prevents account creation spam / resource exhaustion
 *   - Login: prevents brute-force password attacks
 *   - Without rate limiting, an attacker can try 1000 passwords/second
 *
 * How Token Bucket works:
 *   - Each IP starts with N tokens (e.g., 5)
 *   - Each request consumes 1 token
 *   - Tokens refill at a steady rate (e.g., 5 per minute)
 *   - If no tokens left → 429 Too Many Requests
 *
 * ⚠️ SCALABILITY NOTE:
 *   ConcurrentHashMap stores buckets in memory — per instance only.
 *   In a multi-instance setup, an attacker can round-robin across instances
 *   and bypass per-instance limits. Solution: distributed rate limiting with
 *   Redis (Bucket4j supports Redis backends). We'll add this in Phase 6.
 */
package com.nexchat.config;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/*
 * We implement HandlerInterceptor (not a Servlet Filter) because:
 * 1. Interceptors are registered in WebMvcConfigurer (simpler setup)
 * 2. They have access to handler metadata (which controller method is called)
 * 3. They integrate naturally with Spring MVC's dispatch lifecycle
 *
 * Filters (like JwtAuthFilter) are lower-level — they run before Spring MVC
 * even knows which controller will handle the request.
 * For rate limiting, either works. Interceptor is cleaner here.
 */
@Component
@Slf4j
public class RateLimitConfig implements HandlerInterceptor {

    @Value("${nexchat.rate-limit.auth-requests-per-minute}")
    private int authRequestsPerMinute;

    /*
     * ConcurrentHashMap: thread-safe map for concurrent access.
     * Key: client IP address
     * Value: their token bucket
     *
     * ⚠️ MEMORY CONCERN: This map grows unboundedly with unique IPs.
     *   In production, use a Cache with eviction (Caffeine with expireAfterAccess).
     *   For now, the memory impact is negligible for reasonable traffic.
     */
    private final Map<String, Bucket> bucketsByIp = new ConcurrentHashMap<>();

    /**
     * Called before each controller method executes.
     * Return true to proceed; false to abort the request.
     */
    @Override
    public boolean preHandle(
        @NonNull HttpServletRequest request,
        @NonNull HttpServletResponse response,
        @NonNull Object handler
    ) throws Exception {
        String clientIp = extractClientIp(request);
        Bucket bucket = bucketsByIp.computeIfAbsent(clientIp, this::createNewBucket);

        /*
         * tryConsume(1): attempts to take 1 token from the bucket.
         * Returns true if token was available (request allowed).
         * Returns false immediately if bucket is empty (rate limit hit).
         * This is non-blocking — perfect for a request handler.
         */
        if (bucket.tryConsume(1)) {
            return true; // Proceed with the request
        }

        // Rate limit exceeded
        log.warn("Rate limit exceeded for IP: {} on endpoint: {}", clientIp, request.getRequestURI());
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType("application/json");
        response.getWriter().write(
            "{\"success\":false,\"message\":\"Too many requests. Please wait before trying again.\"}"
        );
        return false; // Abort — do not call the controller
    }

    /**
     * Creates a new token bucket for a client IP.
     *
     * Bandwidth.classic(capacity, Refill.greedy(tokens, duration)):
     * - capacity: max tokens the bucket can hold
     * - Refill.greedy: refills tokens as fast as possible up to the rate
     *   (e.g., at 5/min, a new token becomes available every 12 seconds)
     */
    private Bucket createNewBucket(String clientIp) {
        Bandwidth limit = Bandwidth.builder()
            .capacity(authRequestsPerMinute)
            .refillGreedy(authRequestsPerMinute, Duration.ofMinutes(1))
            .build();
        return Bucket.builder()
            .addLimit(limit)
            .build();
    }

    /**
     * Extracts the real client IP, handling reverse proxies.
     *
     * When behind Nginx/load balancer, the client IP is in X-Forwarded-For header.
     * request.getRemoteAddr() would return the proxy's IP (useless for rate limiting).
     *
     * ⚠️ SECURITY: X-Forwarded-For can be spoofed by clients.
     *   In production, only trust this header if it comes from your known proxy.
     *   Nginx should be configured to overwrite (not append) this header.
     */
    private String extractClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            // X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
            // The first one is the original client IP.
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
