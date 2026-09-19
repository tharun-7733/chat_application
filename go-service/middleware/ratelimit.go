// Package middleware provides HTTP middleware for the Go WebSocket service.
// This file implements a simple per-IP connection rate limiter for the /ws endpoint.
package middleware

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	// wsMaxConns is the max new connections allowed per IP per window.
	wsMaxConns int64 = 100
	// wsWindow is the fixed window duration.
	wsWindow = time.Minute
)

// WSRateLimit is an HTTP middleware that limits WebSocket upgrade attempts
// per IP address. Returns 429 if the limit is exceeded.
func WSRateLimit(rdb *redis.Client) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)

			// Simple fixed-window counter using INCR and EXPIRE.
			// Key includes the window block, e.g. unix timestamp / 60
			windowBlock := time.Now().Unix() / int64(wsWindow.Seconds())
			key := fmt.Sprintf("ratelimit:ws:%s:%d", ip, windowBlock)

			ctx, cancel := context.WithTimeout(r.Context(), 500*time.Millisecond)
			defer cancel()

			pipe := rdb.Pipeline()
			incr := pipe.Incr(ctx, key)
			pipe.Expire(ctx, key, wsWindow*2) // keep around slightly longer than the window to handle edge cases
			_, err := pipe.Exec(ctx)

			if err != nil {
				// If Redis is down, we log and fail open (graceful degradation)
				log.Printf("[ratelimit] warning: Redis failed, bypassing rate limit for %s: %v", ip, err)
				next.ServeHTTP(w, r)
				return
			}

			count := incr.Val()

			w.Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", wsMaxConns))
			remaining := wsMaxConns - count
			if remaining < 0 {
				remaining = 0
			}
			w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
			w.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", (windowBlock+1)*int64(wsWindow.Seconds())))

			if count > wsMaxConns {
				log.Printf("[ratelimit] WS rate limit exceeded for IP %s (%d/%d)", ip, count, wsMaxConns)
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", fmt.Sprintf("%d", int64(wsWindow.Seconds())))
				w.WriteHeader(http.StatusTooManyRequests)
				w.Write([]byte(`{"error":"Too Many Requests","message":"Rate limit exceeded"}`))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// clientIP extracts the real client IP, honouring X-Forwarded-For for
// clients behind a reverse proxy.
func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		// X-Forwarded-For may be a comma-separated list; take the first entry.
		host, _, err := net.SplitHostPort(fwd)
		if err == nil {
			return host
		}
		return fwd
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
