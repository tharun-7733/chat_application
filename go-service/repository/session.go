package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Session mirrors the ISession interface from Node.js
type Session struct {
	ID        string    `bson:"_id"`
	UserID    string    `bson:"userId"`
	Token     string    `bson:"token"`
	ExpiresAt time.Time `bson:"expiresAt"`
	CreatedAt time.Time `bson:"createdAt"`
}

type SessionRepository struct {
	coll *mongo.Collection
}

func NewSessionRepository(ctx context.Context, db *mongo.Database) (*SessionRepository, error) {
	coll := db.Collection("sessions")

	// Create TTL index on expiresAt (like Node.js schema)
	indexModel := mongo.IndexModel{
		Keys:    bson.D{{Key: "expiresAt", Value: 1}},
		Options: options.Index().SetExpireAfterSeconds(0),
	}
	_, err := coll.Indexes().CreateOne(ctx, indexModel)
	if err != nil {
		return nil, fmt.Errorf("create session TTL index: %w", err)
	}

	return &SessionRepository{coll: coll}, nil
}

func (r *SessionRepository) Create(ctx context.Context, userID, token string, expiresAt time.Time) (*Session, error) {
	session := &Session{
		ID:        uuid.New().String(),
		UserID:    userID,
		Token:     token,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now().UTC(),
	}

	_, err := r.coll.InsertOne(ctx, session)
	if err != nil {
		return nil, fmt.Errorf("insert session: %w", err)
	}
	return session, nil
}

func (r *SessionRepository) FindByToken(ctx context.Context, token string) (*Session, error) {
	var session Session
	err := r.coll.FindOne(ctx, bson.M{"token": token}).Decode(&session)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, fmt.Errorf("find session: %w", err)
	}
	return &session, nil
}

func (r *SessionRepository) DeleteByToken(ctx context.Context, token string) error {
	_, err := r.coll.DeleteOne(ctx, bson.M{"token": token})
	return err
}
