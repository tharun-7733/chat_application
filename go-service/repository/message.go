// Package repository provides MongoDB data access for the Go service.
//
// Message schema mirrors the Node.js Mongoose Message model exactly:
//
//	Collection: "messages"
//	Fields:     _id (UUID string), senderId, receiverId, content,
//	            messageType, isRead, sentAt, deliveredAt, readAt
//
// The Go service only ever WRITES messages (real-time delivery path).
// The Node.js service owns READ operations (history, pagination).
package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// Message mirrors the IMessage interface from the Node.js Message model.
type Message struct {
	// ID is a UUID string — matches Node.js uuidv4() default.
	ID          string    `bson:"_id"`
	SenderID    string    `bson:"senderId"`
	ReceiverID  string    `bson:"receiverId"`
	Content     string    `bson:"content"`
	MessageType string    `bson:"messageType"`
	IsRead      bool      `bson:"isRead"`
	SentAt      time.Time `bson:"sentAt"`
}

// SavedMessage is the minimal result returned to the WebSocket handler
// after a message is persisted. Matches the shape previously returned
// by the Node.js /api/internal/messages endpoint.
type SavedMessage struct {
	ID     string
	SentAt time.Time
}

// MessageRepository handles MongoDB writes for chat messages.
type MessageRepository struct {
	coll *mongo.Collection
}

// NewMessageRepository creates a repository bound to the given database.
// dbName should match the Node.js MONGODB_URI database name (e.g. "nexchat").
func NewMessageRepository(db *mongo.Database) *MessageRepository {
	return &MessageRepository{
		coll: db.Collection("messages"),
	}
}

// Save persists a new chat message and returns the stored ID and timestamp.
// This is the Go equivalent of Node.js createMessage() in message.repository.ts.
//
// Schema alignment:
//   - _id:         UUID v4 string (matches Node.js uuidv4 default)
//   - messageType: "TEXT" (default for WebSocket chat)
//   - isRead:      false
//   - sentAt:      UTC now
func (r *MessageRepository) Save(ctx context.Context, senderID, receiverID, content string) (*SavedMessage, error) {
	id := uuid.New().String()
	now := time.Now().UTC()

	doc := bson.D{
		{Key: "_id", Value: id},
		{Key: "senderId", Value: senderID},
		{Key: "receiverId", Value: receiverID},
		{Key: "content", Value: content},
		{Key: "messageType", Value: "TEXT"},
		{Key: "isRead", Value: false},
		{Key: "sentAt", Value: now},
	}

	_, err := r.coll.InsertOne(ctx, doc)
	if err != nil {
		return nil, fmt.Errorf("insert message: %w", err)
	}

	return &SavedMessage{
		ID:     id,
		SentAt: now,
	}, nil
}
