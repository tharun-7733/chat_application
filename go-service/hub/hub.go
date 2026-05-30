// Package hub implements the in-memory registry of live WebSocket clients.
//
// Architecture:
//   - One Hub per process (singleton).
//   - Each connected browser session is one Client.
//   - Hub maintains a map of userID → Client for instant local delivery.
//   - All hub mutations (register, unregister, send) happen in a single goroutine
//     driven by channel receives, so no mutex is needed.
//
// Why channels instead of mutexes?
//   "Do not communicate by sharing memory; share memory by communicating."
//   — Go proverb. Channels naturally serialise access to shared state.
package hub

import (
	"log"
	"sync"
)

// Hub is the central registry of all active WebSocket clients on this instance.
type Hub struct {
	// clients maps userID (UUID string) to the connected Client.
	// A user can only have one active connection (last-write-wins on reconnect).
	clients map[string]*Client

	// register receives new clients that have just upgraded their HTTP connection.
	register chan *Client

	// unregister receives clients that have disconnected or errored.
	unregister chan *Client

	// mu protects the clients map for the rare cases we need to read outside the Run loop.
	mu sync.RWMutex
}

// New creates and returns a ready-to-use Hub.
// Call Run() in a goroutine to start processing.
func New() *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		register:   make(chan *Client, 32),
		unregister: make(chan *Client, 32),
	}
}

// Run processes registration and unregistration events.
// MUST be called in its own goroutine: go hub.Run()
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			// If the user already has a connection (e.g. browser tab refresh),
			// close the old one before registering the new one.
			if existing, ok := h.clients[client.UserID]; ok {
				log.Printf("[hub] user %s reconnected — closing old connection", client.UserID)
				close(existing.send)
			}
			h.clients[client.UserID] = client
			h.mu.Unlock()
			log.Printf("[hub] user %s connected (total: %d)", client.UserID, len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if current, ok := h.clients[client.UserID]; ok && current == client {
				delete(h.clients, client.UserID)
				close(client.send)
				log.Printf("[hub] user %s disconnected (total: %d)", client.UserID, len(h.clients))
			}
			h.mu.Unlock()
		}
	}
}

// Register enqueues a client for registration. Non-blocking.
func (h *Hub) Register(c *Client) {
	h.register <- c
}

// Unregister enqueues a client for removal. Non-blocking.
func (h *Hub) Unregister(c *Client) {
	h.unregister <- c
}

// Send delivers a raw JSON payload to the user identified by userID.
// Returns true if the user is connected locally, false otherwise.
// This is called by the Redis subscriber when a message arrives for a local user.
func (h *Hub) Send(userID string, payload []byte) bool {
	h.mu.RLock()
	client, ok := h.clients[userID]
	h.mu.RUnlock()

	if !ok {
		return false // user not connected on this instance
	}

	select {
	case client.send <- payload:
		return true
	default:
		// Write buffer full — client is too slow. Drop the message.
		// In production, you'd persist this and redeliver.
		log.Printf("[hub] send buffer full for user %s — dropping message", userID)
		return false
	}
}

// OnlineUsers returns a snapshot of currently connected user IDs.
// Used for debugging and the /health endpoint.
func (h *Hub) OnlineUsers() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	users := make([]string, 0, len(h.clients))
	for id := range h.clients {
		users = append(users, id)
	}
	return users
}
