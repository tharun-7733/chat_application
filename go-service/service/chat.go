// Package service implements business logic for the Go WebSocket service.
//
// ChatService is the single entry point for the WebSocket handler —
// it owns message persistence and follows the same architectural pattern
// as the Node.js service layer (Handler → Service → Repository → MongoDB).
package service

import (
	"context"
	"fmt"
	"log"

	"github.com/nexchat/go-service/repository"
)

// SavedMessage is returned to the handler after a message is persisted.
type SavedMessage struct {
	ID     string
	SentAt string // RFC3339 UTC string, ready for JSON serialisation
}

// ChatService persists chat messages via the message repository.
type ChatService struct {
	repo *repository.MessageRepository
}

// NewChatService creates a ChatService backed by the given repository.
func NewChatService(repo *repository.MessageRepository) *ChatService {
	return &ChatService{repo: repo}
}

// SaveMessage persists a text message from senderID to receiverID.
// On repository error it logs and returns the error; the caller decides
// whether to fall back to best-effort delivery.
func (s *ChatService) SaveMessage(ctx context.Context, senderID, receiverID, content string) (*SavedMessage, error) {
	saved, err := s.repo.Save(ctx, senderID, receiverID, content)
	if err != nil {
		log.Printf("[chat-service] failed to save message from %s to %s: %v", senderID, receiverID, err)
		return nil, fmt.Errorf("save message: %w", err)
	}

	return &SavedMessage{
		ID:     saved.ID,
		SentAt: saved.SentAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
	}, nil
}

// GetHistory returns conversation history between two users, oldest-first.
func (s *ChatService) GetHistory(ctx context.Context, userA, userB string, limit int64) ([]repository.Message, error) {
	return s.repo.FindConversation(ctx, userA, userB, limit)
}
