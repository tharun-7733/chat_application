/**
 * NexChat — Web MVC Configuration
 *
 * Registers Spring MVC interceptors and configures global web behavior.
 * Interceptors are applied to controller method invocations (after Spring
 * MVC routing has resolved which controller handles the request).
 */
package com.nexchat.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final RateLimitConfig rateLimitConfig;

    /**
     * Registers the rate limit interceptor for auth endpoints only.
     *
     * addPathPatterns: which URL patterns this interceptor applies to.
     * excludePathPatterns: exceptions within the included patterns.
     *
     * We only rate limit /api/auth/** because:
     * - Register + Login are brute-force targets
     * - Other endpoints already require a valid JWT (natural protection)
     *   and we don't want to penalize legitimate users for normal activity.
     */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(rateLimitConfig)
            .addPathPatterns("/api/auth/**")
            .excludePathPatterns("/api/auth/health"); // Health check is never rate limited
    }
}
