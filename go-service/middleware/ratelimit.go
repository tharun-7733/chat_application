// Package middleware provides HTTP middleware for the Go WebSocket service.
// This file implements a simple per-IP connection rate limiter for the /ws endpoint.
//
// Algorithm: sliding-window counter backed by a sync.Map.
// For distributed rate limiting across multiple Go instances, swap
// the in-memory map for a Redis INCR + EXPIRE approach.
package middleware

import (
	"log"
	"net"
	"net/http"
	"sync"
	"time"
)

// wsEntry tracks the connection count and window start for a single IP.
type wsEntry struct {
	mu       sync.Mutex
	count    int
	windowAt time.Time
}

var (
	wsLimiterMap sync.Map // IP string → *wsEntry
	// wsMaxConns is the max new WebSocket connections allowed per IP per window.
	wsMaxConns = 10
	// wsWindow is the sliding window duration.
	wsWindow = time.Minute
)

// WSRateLimit is an HTTP middleware that limits WebSocket upgrade attempts
// per IP address. Returns 429 if the limit is exceeded.
func WSRateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)

		val, _ := wsLimiterMap.LoadOrStore(ip, &wsEntry{windowAt: time.Now()})
		entry := val.(*wsEntry)

		entry.mu.Lock()
		now := time.Now()
		if now.Sub(entry.windowAt) > wsWindow {
			// New window — reset counter
			entry.count = 0
			entry.windowAt = now
		}
		entry.count++
		count := entry.count
		entry.mu.Unlock()

		if count > wsMaxConns {
			log.Printf("[ratelimit] WS rate limit exceeded for IP %s (%d/%d)", ip, count, wsMaxConns)
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error":"Too Many Requests","message":"WebSocket connection rate limit exceeded. Please try again in 60 seconds."}`))
			return
		}

		next.ServeHTTP(w, r)
	})
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
