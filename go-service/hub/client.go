// Package hub — Client represents one connected WebSocket session.
//
// Each Client has two goroutines:
//   - ReadPump: reads frames from the browser, routes messages via hub + Redis
//   - WritePump: drains the send channel and writes frames to the browser
//
// This "one goroutine per direction" pattern is the standard Go WebSocket idiom.
// gorilla/websocket requires that only one goroutine reads and one goroutine writes.
package hub

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// writeWait is the time allowed to write a message to the browser.
	writeWait = 10 * time.Second

	// pongWait is the time allowed to read the next pong message from the browser.
	// Browsers send pong automatically in response to ping.
	pongWait = 60 * time.Second

	// pingPeriod is how often we send pings. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// maxMessageSize is the maximum frame size from the browser in bytes.
	maxMessageSize = 8192 // 8 KB
)

// IncomingMessage is the JSON structure the browser sends over WebSocket.
type IncomingMessage struct {
	// Type is the event type: "message", "typing"
	Type string `json:"type"`

	// To is the recipient's user UUID
	To string `json:"to"`

	// Content is the message body (for type="message")
	Content string `json:"content,omitempty"`

	// IsTyping is the typing indicator state (for type="typing")
	IsTyping bool `json:"isTyping,omitempty"`
}

// OutgoingMessage is the JSON structure sent to the browser.
type OutgoingMessage struct {
	Type      string `json:"type"`
	ID        string `json:"id,omitempty"`
	SenderID  string `json:"senderId,omitempty"`
	Content   string `json:"content,omitempty"`
	CreatedAt string `json:"createdAt,omitempty"`
	UserID    string `json:"userId,omitempty"`
	IsTyping  bool   `json:"isTyping,omitempty"`
	Status    string `json:"status,omitempty"`
}

// MessageHandler is called by ReadPump when a new chat message arrives.
// The hub/ws handler wires up the actual routing + persistence logic.
type MessageHandler func(client *Client, msg IncomingMessage)

// Client is a single WebSocket connection.
type Client struct {
	// UserID is the authenticated user's UUID.
	UserID string

	// hub is the central registry this client belongs to.
	hub *Hub

	// conn is the underlying WebSocket connection.
	conn *websocket.Conn

	// send is a buffered channel of JSON payloads to write to the browser.
	// Buffered so WritePump doesn't block on slow browsers.
	send chan []byte

	// onMessage is called for each inbound message.
	onMessage MessageHandler
}

// NewClient creates a Client and wires it to its hub.
func NewClient(h *Hub, conn *websocket.Conn, userID string, onMessage MessageHandler) *Client {
	return &Client{
		UserID:    userID,
		hub:       h,
		conn:      conn,
		send:      make(chan []byte, 256),
		onMessage: onMessage,
	}
}

// ReadPump reads frames from the browser in a blocking loop.
// Must run in its own goroutine.
func (c *Client) ReadPump() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		// Reset the read deadline each time we receive a pong.
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[client] read error for user %s: %v", c.UserID, err)
			}
			break
		}

		var msg IncomingMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("[client] invalid JSON from user %s: %v", c.UserID, err)
			continue
		}

		if c.onMessage != nil {
			c.onMessage(c, msg)
		}
	}
}

// WritePump drains the send channel and writes frames to the browser.
// Sends periodic pings to detect dead connections.
// Must run in its own goroutine.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case payload, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel — write a close frame.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(payload)

			// Flush any messages that queued while we were writing.
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte("\n"))
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// SendJSON serialises v and enqueues it for delivery to this client.
func (c *Client) SendJSON(v interface{}) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	select {
	case c.send <- data:
	default:
		log.Printf("[client] send buffer full for user %s", c.UserID)
	}
	return nil
}
