// Package config loads all environment variables the service needs.
// Centralising config here means no env-var reads scattered throughout the code.
package config

import (
	"log"
	"os"
)

// Config holds all runtime configuration for the Go WebSocket service.
type Config struct {
	// Port the HTTP server listens on (default: 8081)
	Port string

	// JWTSecret is the HMAC-SHA256 key shared with the Java service.
	// MUST match nexchat.jwt.secret in Java's application.yml.
	JWTSecret string

	// RedisURL is the Redis connection string, e.g. "redis:6379" or "localhost:6379".
	RedisURL string

	// JavaServiceURL is the base URL for the Java REST API, e.g. "http://localhost:8080".
	// Used to call POST /internal/messages for message persistence.
	JavaServiceURL string

	// InternalSecret is a shared secret between Go and Java for internal API calls.
	// Sent as X-Internal-Token header. Prevents external callers from injecting messages.
	InternalSecret string
}

// Load reads config from environment variables with sensible dev defaults.
func Load() *Config {
	cfg := &Config{
		Port:           getEnv("PORT", "8081"),
		JWTSecret:      getEnv("JWT_SECRET", "dev-secret-key-minimum-32-bytes-long"),
		RedisURL:       getEnv("REDIS_URL", "localhost:6379"),
		JavaServiceURL: getEnv("JAVA_SERVICE_URL", "http://localhost:8080"),
		InternalSecret: getEnv("INTERNAL_SECRET", "nexchat-internal-dev-secret"),
	}

	// Warn but don't crash on missing critical secrets — this is a dev service.
	if cfg.JWTSecret == "dev-secret-key-minimum-32-bytes-long" {
		log.Println("⚠️  WARNING: Using default JWT_SECRET. Set JWT_SECRET env var in production.")
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
