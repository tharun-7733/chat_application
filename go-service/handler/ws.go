// Package handler provides HTTP handlers for the Go WebSocket service.
package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nexchat/go-service/broker"
	"github.com/nexchat/go-service/hub"
	"github.com/nexchat/go-service/middleware"
	"github.com/nexchat/go-service/service"
)

// WsHandler handles GET /ws?token=<JWT>
// Upgrades the HTTP connection to WebSocket and wires up the client.
func WsHandler(h *hub.Hub, b *broker.Broker, chat *service.ChatService, jwtSecret string, allowedOrigins string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Extract and validate JWT from query param or Authorization header
		token := r.URL.Query().Get("token")
		if token == "" {
			token = r.Header.Get("Authorization")
		}

		userID, err := middleware.ValidateJWT(token, jwtSecret)
		if err != nil {
			log.Printf("[ws] auth failed: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"error":"Unauthorized","message":"Invalid or expired token"}`))
			return
		}

		// 2. Upgrade HTTP → WebSocket with secure origin checking
		upgrader := websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true // allow non-browser clients (like mobile apps)
				}
				for _, allowed := range strings.Split(allowedOrigins, ",") {
					if origin == strings.TrimSpace(allowed) || allowed == "*" {
						return true
					}
				}
				log.Printf("[ws] Rejected origin: %s", origin)
				return false
			},
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("[ws] upgrade failed for user %s: %v", userID, err)
			return
		}

		// 3. Create Client with message handler wired to routing + persistence
		client := hub.NewClient(h, conn, userID, makeMessageHandler(h, b, chat, userID))

		// 4. Register with hub
		h.Register(client)

		// 5. Subscribe to Redis channel for this user (for cross-instance delivery)
		// Run in background goroutine; cancelled when client context is done.
		subCtx, subCancel := context.WithCancel(context.Background())
		go func() {
			b.Subscribe(subCtx, userID, func(payload []byte) {
				// Redis delivered a message targeted at this user.
				// Push it directly to the WebSocket send buffer.
				h.Send(userID, payload)
			})
		}()

		// 6. Mark user as online in Redis
		b.SetPresence(context.Background(), userID, true)

		// 7. Send a "connected" ack to the client
		client.SendJSON(hub.OutgoingMessage{
			Type:   "connected",
			UserID: userID,
		})

		log.Printf("[ws] user %s connected from %s", userID, r.RemoteAddr)

		// 8. Start read and write pumps (blocking — run in goroutines)
		go client.WritePump()

		// ReadPump runs in this goroutine (blocks until disconnect)
		// When it returns, we clean up.
		client.ReadPump()

		// Cleanup on disconnect
		subCancel()
		b.SetPresence(context.Background(), userID, false)
		log.Printf("[ws] user %s disconnected", userID)
	}
}

// makeMessageHandler returns the routing function called for each inbound frame.
// This is where a client's message gets routed:
//   - persisted directly to MongoDB via the chat service
//   - delivered locally (if recipient connected on this instance)
//   - or published to Redis (for cross-instance delivery)
func makeMessageHandler(h *hub.Hub, b *broker.Broker, chat *service.ChatService, senderID string) hub.MessageHandler {
	return func(client *hub.Client, msg hub.IncomingMessage) {
		switch msg.Type {

		case "message":
			if msg.To == "" || msg.Content == "" {
				return
			}

			// Persist directly to MongoDB (async — don't block delivery)
			var msgID, sentAt string
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()

			saved, err := chat.SaveMessage(ctx, senderID, msg.To, msg.Content)
			if err != nil {
				// Persistence failed — still deliver the message (best-effort)
				// In production: queue to a dead-letter topic for retry
				log.Printf("[handler] persistence failed: %v", err)
				msgID = fmt.Sprintf("tmp-%d", time.Now().UnixMilli())
				sentAt = time.Now().UTC().Format(time.RFC3339)
			} else {
				msgID = saved.ID
				sentAt = saved.SentAt
			}

			// Build the outgoing envelope for the recipient
			outgoing := hub.OutgoingMessage{
				Type:      "message",
				ID:        msgID,
				SenderID:  senderID,
				Content:   msg.Content,
				CreatedAt: sentAt,
				Status:    "delivered",
			}

			payload, _ := json.Marshal(outgoing)

			// Publish to Redis for cross-instance and local delivery
			pubCtx, pubCancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer pubCancel()
			if err := b.Publish(pubCtx, msg.To, payload); err != nil {
				log.Printf("[handler] Redis publish failed, falling back to local delivery: %v", err)
				h.Send(msg.To, payload)
			}

			// Also echo back to sender with the DB-assigned ID and sentAt
			// so the sender's UI can update the "sent" message with real metadata.
			senderAck := hub.OutgoingMessage{
				Type:      "ack",
				ID:        msgID,
				SenderID:  senderID,
				Content:   msg.Content,
				CreatedAt: sentAt,
				Status:    "sent",
			}
			client.SendJSON(senderAck)

		case "typing":
			if msg.To == "" {
				return
			}

			// Forward typing indicator to recipient
			typingMsg := hub.OutgoingMessage{
				Type:     "typing",
				UserID:   senderID,
				IsTyping: msg.IsTyping,
			}
			payload, _ := json.Marshal(typingMsg)

			// Cross-instance via Redis
			pubCtx, pubCancel := context.WithTimeout(context.Background(), 1*time.Second)
			defer pubCancel()
			if err := b.Publish(pubCtx, msg.To, payload); err != nil {
				h.Send(msg.To, payload)
			}
		}
	}
}
