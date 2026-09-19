// NexChat — Go WebSocket Service
//
// Entry point. Wires up:
//   - Config (env vars)
//   - MongoDB (direct message persistence)
//   - Redis broker (pub/sub + presence)
//   - Hub (in-memory connection registry)
//   - Chat service + message repository
//   - HTTP server with /ws and /health routes
//
// Run: PORT=8081 JWT_SECRET=... REDIS_URL=localhost:6379 MONGO_URI=mongodb://localhost:27017 go run ./...
package main

import (
	"context"
	"log"
	"net/http"

	"github.com/nexchat/go-service/broker"
	"github.com/nexchat/go-service/config"
	"github.com/nexchat/go-service/db"
	"github.com/nexchat/go-service/handler"
	"github.com/nexchat/go-service/hub"
	"github.com/nexchat/go-service/middleware"
	"github.com/nexchat/go-service/repository"
	"github.com/nexchat/go-service/service"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("🚀 NexChat Go WebSocket Service starting...")

	// ── 1. Load configuration ────────────────────────────────────────────────
	cfg := config.Load()
	log.Printf("[config] Port=%s  Redis=%s  MongoDB=%s  DB=%s",
		cfg.Port, cfg.RedisURL, cfg.MongoURI, cfg.DBName)

	// ── 2. Connect to MongoDB ─────────────────────────────────────────────────
	mongoClient, closeDB, err := db.Connect(context.Background(), cfg.MongoURI)
	if err != nil {
		log.Fatalf("[main] failed to connect to MongoDB: %v", err)
	}
	defer closeDB()

	// ── 3. Build repository and service layer ─────────────────────────────────
	database := mongoClient.Database(cfg.DBName)
	msgRepo := repository.NewMessageRepository(database)
	chatSvc := service.NewChatService(msgRepo)

	// ── 4. Connect to Redis ──────────────────────────────────────────────────
	b, err := broker.New(cfg.RedisURL)
	if err != nil {
		log.Fatalf("[main] failed to connect to Redis: %v", err)
	}

	// ── 5. Create Hub and start its event loop ───────────────────────────────
	h := hub.New()
	go h.Run()

	// ── 6. Register HTTP routes ──────────────────────────────────────────────
	mux := http.NewServeMux()

	// WebSocket upgrade endpoint — rate limited, then JWT authenticated
	// Clients connect with: ws://localhost:8081/ws?token=<JWT>
	wsHandler := handler.WsHandler(h, b, chatSvc, cfg.JWTSecret)
	mux.Handle("/ws", middleware.WSRateLimit(http.HandlerFunc(wsHandler)))

	// Health check
	// curl http://localhost:8081/health
	mux.HandleFunc("/health", handler.HealthHandler(h))

	// ── 7. Start HTTP server ─────────────────────────────────────────────────
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
