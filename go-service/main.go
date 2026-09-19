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
	"strings"

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
	userRepo := repository.NewUserRepository(database)
	sessionRepo, err := repository.NewSessionRepository(context.Background(), database)
	if err != nil {
		log.Fatalf("[main] failed to init session repo: %v", err)
	}
	friendRepo, err := repository.NewFriendRepository(context.Background(), database)
	if err != nil {
		log.Fatalf("[main] failed to init friend repo: %v", err)
	}

	chatSvc := service.NewChatService(msgRepo)
	authSvc := service.NewAuthService(userRepo, sessionRepo, cfg.JWTSecret)
	userSvc := service.NewUserService(userRepo)
	friendSvc := service.NewFriendService(friendRepo)

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

	authH := handler.NewAuthHandler(authSvc)
	userH := handler.NewUserHandler(userSvc)
	friendH := handler.NewFriendHandler(friendSvc)

	// Auth routes (rate limited)
	authLimiter := middleware.WSRateLimit(b.Client())
	mux.Handle("POST /api/auth/register", authLimiter(http.HandlerFunc(authH.Register)))
	mux.Handle("POST /api/auth/login", authLimiter(http.HandlerFunc(authH.Login)))
	mux.HandleFunc("POST /api/auth/refresh", authH.Refresh)
	mux.HandleFunc("POST /api/auth/logout", authH.Logout)

	// Protected REST API routes
	requireAuth := middleware.RequireAuth(cfg.JWTSecret)
	mux.Handle("GET /api/users/me", requireAuth(http.HandlerFunc(userH.GetMe)))
	mux.Handle("GET /api/friends", requireAuth(http.HandlerFunc(friendH.GetFriends)))
	mux.Handle("GET /api/friends/pending", requireAuth(http.HandlerFunc(friendH.GetPendingRequests)))
	mux.Handle("POST /api/friends/requests", requireAuth(http.HandlerFunc(friendH.SendRequest)))
	mux.Handle("PUT /api/friends/requests/{id}/accept", requireAuth(http.HandlerFunc(friendH.AcceptRequest)))
	mux.Handle("DELETE /api/friends/requests/{id}/reject", requireAuth(http.HandlerFunc(friendH.RejectRequest)))

	// WebSocket upgrade endpoint — rate limited, then JWT authenticated
	// Clients connect with: ws://localhost:8081/ws?token=<JWT>
	wsHandler := handler.WsHandler(h, b, chatSvc, cfg.JWTSecret, cfg.AllowedOrigins)
	mux.Handle("/ws", middleware.WSRateLimit(b.Client())(http.HandlerFunc(wsHandler)))

	// Health check
	// curl http://localhost:8081/health
	mux.HandleFunc("/health", handler.HealthHandler(h))

	// ── 7. Start HTTP server ─────────────────────────────────────────────────
	addr := ":" + cfg.Port
	log.Printf("✅ WebSocket server listening on %s", addr)
	log.Printf("   WebSocket endpoint: ws://localhost%s/ws", addr)
	log.Printf("   Health endpoint:    http://localhost%s/health", addr)

	if err := http.ListenAndServe(addr, corsMiddleware(mux, cfg.AllowedOrigins)); err != nil {
		log.Fatalf("[main] server failed: %v", err)
	}
}

// corsMiddleware adds CORS headers to allow the React dev server to connect.
// In production, restrict the Origin to your actual domain.
func corsMiddleware(next http.Handler, allowedOrigins string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Secure headers
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

		// CORS configuration
		origin := r.Header.Get("Origin")
		isAllowed := false

		if allowedOrigins == "*" {
			isAllowed = true
		} else {
			for _, allowed := range strings.Split(allowedOrigins, ",") {
				if origin == strings.TrimSpace(allowed) || allowed == "*" {
					isAllowed = true
					break
				}
			}
		}

		if isAllowed {
			if origin == "" {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			} else {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
