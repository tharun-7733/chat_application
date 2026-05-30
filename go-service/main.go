// NexChat — Go WebSocket Service
//
// Entry point. Wires up:
//   - Config (env vars)
//   - Redis broker (pub/sub + presence)
//   - Hub (in-memory connection registry)
//   - Persist client (calls Java REST API)
//   - HTTP server with /ws and /health routes
//
// Run: PORT=8081 JWT_SECRET=... REDIS_URL=localhost:6379 JAVA_SERVICE_URL=http://localhost:8080 go run ./...
package main

import (
	"log"
	"net/http"

	"github.com/nexchat/go-service/broker"
	"github.com/nexchat/go-service/config"
	"github.com/nexchat/go-service/handler"
	"github.com/nexchat/go-service/hub"
	"github.com/nexchat/go-service/persist"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("🚀 NexChat Go WebSocket Service starting...")

	// ── 1. Load configuration ────────────────────────────────────────────────
	cfg := config.Load()
	log.Printf("[config] Port=%s  Redis=%s  JavaURL=%s", cfg.Port, cfg.RedisURL, cfg.JavaServiceURL)

	// ── 2. Connect to Redis ──────────────────────────────────────────────────
	b, err := broker.New(cfg.RedisURL)
	if err != nil {
		log.Fatalf("[main] failed to connect to Redis: %v", err)
	}

	// ── 3. Create Hub and start its event loop ───────────────────────────────
	h := hub.New()
	go h.Run()

	// ── 4. Create persistence client ────────────────────────────────────────
	p := persist.New(cfg.JavaServiceURL, cfg.InternalSecret)

	// ── 5. Register HTTP routes ──────────────────────────────────────────────
	mux := http.NewServeMux()

	// WebSocket upgrade endpoint
	// Clients connect with: ws://localhost:8081/ws?token=<JWT>
	mux.HandleFunc("/ws", handler.WsHandler(h, b, p, cfg.JWTSecret))

	// Health check
	// curl http://localhost:8081/health
	mux.HandleFunc("/health", handler.HealthHandler(h))

	// ── 6. Start HTTP server ─────────────────────────────────────────────────
	addr := ":" + cfg.Port
	log.Printf("✅ WebSocket server listening on %s", addr)
	log.Printf("   WebSocket endpoint: ws://localhost%s/ws", addr)
	log.Printf("   Health endpoint:    http://localhost%s/health", addr)

	if err := http.ListenAndServe(addr, corsMiddleware(mux)); err != nil {
		log.Fatalf("[main] server failed: %v", err)
	}
}

// corsMiddleware adds CORS headers to allow the React dev server to connect.
// In production, restrict the Origin to your actual domain.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
