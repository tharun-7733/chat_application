// Package persist calls the Node backend service to persist chat messages to MongoDB.
//
// Why does Go call Node for persistence instead of writing to MongoDB directly?
//   - Single source of truth: Node owns the DB schema and Mongoose models
//   - Node handles validation and API behavior
//   - Go can stay stateless (no DB connection overhead per instance)
//   - Separation of concerns: Go = realtime relay, Node = data integrity
//
// This is the "sidecar" pattern in a microservice architecture.
package persist

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// Client is an HTTP client for the Node persistence API.
type Client struct {
	baseURL        string
	internalSecret string
	http           *http.Client
}

// MessageRequest is the payload sent to Node's POST /internal/messages.
type MessageRequest struct {
	SenderID   string `json:"senderId"`
	ReceiverID string `json:"receiverId"`
	Content    string `json:"content"`
}

// MessageResponse is the response from Node after persisting the message.
type MessageResponse struct {
	ID        string `json:"id"`
	SenderID  string `json:"senderId"`
	ReceiverID string `json:"receiverId"`
	Content   string `json:"content"`
	SentAt    string `json:"sentAt"`
}

// New creates a persist.Client.
// nodeBaseURL: e.g. "http://localhost:8080"
// internalSecret: must match INTERNAL_SECRET env var in Node service
func New(nodeBaseURL, internalSecret string) *Client {
	return &Client{
		baseURL:        nodeBaseURL,
		internalSecret: internalSecret,
		http: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// SaveMessage calls POST /internal/messages on the Node service.
// Returns the persisted message (with DB-assigned ID and sentAt).
func (c *Client) SaveMessage(ctx context.Context, senderID, receiverID, content string) (*MessageResponse, error) {
	reqBody := MessageRequest{
		SenderID:   senderID,
		ReceiverID: receiverID,
		Content:    content,
	}

	data, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal message request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/internal/messages", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.internalSecret)

	resp, err := c.http.Do(req)
	if err != nil {
		// Don't fail the message delivery if persistence is temporarily down.
		// Log and continue — the message was still delivered via WebSocket.
		log.Printf("[persist] WARNING: failed to persist message from %s to %s: %v", senderID, receiverID, err)
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		log.Printf("[persist] Node returned %d: %s", resp.StatusCode, string(body))
		return nil, fmt.Errorf("node service returned %d", resp.StatusCode)
	}

	// Parse ApiResponse<MessageResponse> envelope from Node
	var envelope struct {
		Success bool            `json:"success"`
		Data    MessageResponse `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	return &envelope.Data, nil
}
