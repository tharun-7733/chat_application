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

	// JWTSecret is the HMAC-SHA256 key shared with the Node.js service.
	// MUST match JWT_SECRET in the Node.js backend.
	JWTSecret string

	// RedisURL is the Redis connection string, e.g. "redis:6379" or "localhost:6379".
	RedisURL string

	// MongoURI is the full MongoDB connection string.
	// e.g. "mongodb://localhost:27017" or "mongodb://mongodb:27017"
	MongoURI string

	// DBName is the MongoDB database name (default: "nexchat").
	DBName string

	// AllowedOrigins restricts CORS and WebSocket origins. Comma-separated.
	AllowedOrigins string
}

// Load reads config from environment variables with sensible dev defaults.
func Load() *Config {
	cfg := &Config{
		Port:      getEnv("PORT", "8081"),
		JWTSecret: getEnv("JWT_SECRET", "dev-secret-key-minimum-32-bytes-long"),
		RedisURL:  getEnv("REDIS_URL", "localhost:6379"),
		MongoURI:  getEnv("MONGO_URI", "mongodb://localhost:27017"),
		DBName:    getEnv("DB_NAME", "nexchat"),
		AllowedOrigins: getEnv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"),
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
