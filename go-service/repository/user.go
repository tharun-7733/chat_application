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

// User mirrors the IUser interface from Node.js.
// json tags produce camelCase field names the React frontend expects.
type User struct {
	ID            string    `bson:"_id"            json:"id"`
	Username      string    `bson:"username"       json:"username"`
	Email         string    `bson:"email"          json:"email"`
	PasswordHash  string    `bson:"passwordHash"   json:"-"`
	AvatarURL     string    `bson:"avatarUrl"      json:"avatarUrl,omitempty"`
	StatusMessage string    `bson:"statusMessage"  json:"statusMessage,omitempty"`
	LastSeen      time.Time `bson:"lastSeen"       json:"lastSeen,omitempty"`
	CreatedAt     time.Time `bson:"createdAt"      json:"createdAt"`
	UpdatedAt     time.Time `bson:"updatedAt"      json:"updatedAt"`
}

// PublicUser is the safe subset returned to other users (no email, no hash).
type PublicUser struct {
	ID            string    `json:"id"`
	Username      string    `json:"username"`
	AvatarURL     string    `json:"avatarUrl,omitempty"`
	StatusMessage string    `json:"statusMessage,omitempty"`
	LastSeen      time.Time `json:"lastSeen,omitempty"`
}

type UserRepository struct {
	coll *mongo.Collection
}

func NewUserRepository(db *mongo.Database) *UserRepository {
	return &UserRepository{
		coll: db.Collection("users"),
	}
}

func (r *UserRepository) Create(ctx context.Context, username, email, passwordHash string) (*User, error) {
	now := time.Now().UTC()
	user := &User{
		ID:           uuid.New().String(),
		Username:     username,
		Email:        email,
		PasswordHash: passwordHash,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	_, err := r.coll.InsertOne(ctx, user)
	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}
	return user, nil
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*User, error) {
	var user User
	err := r.coll.FindOne(ctx, bson.M{"email": email}).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil // Not found
		}
		return nil, fmt.Errorf("find user by email: %w", err)
	}
	return &user, nil
}

func (r *UserRepository) FindByID(ctx context.Context, id string) (*User, error) {
	var user User
	err := r.coll.FindOne(ctx, bson.M{"_id": id}).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, fmt.Errorf("find user by id: %w", err)
	}
	return &user, nil
}

func (r *UserRepository) UpdateLastSeen(ctx context.Context, id string) error {
	_, err := r.coll.UpdateOne(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{"lastSeen": time.Now().UTC(), "updatedAt": time.Now().UTC()}},
	)
	return err
}

// FindAll returns all users except the one with excludeID.
func (r *UserRepository) FindAll(ctx context.Context, excludeID string) ([]User, error) {
	cursor, err := r.coll.Find(
		ctx,
		bson.M{"_id": bson.M{"$ne": excludeID}},
		options.Find().SetSort(bson.D{{Key: "username", Value: 1}}).SetLimit(200),
	)
	if err != nil {
		return nil, fmt.Errorf("find all users: %w", err)
	}
	defer cursor.Close(ctx)
	var users []User
	if err = cursor.All(ctx, &users); err != nil {
		return nil, fmt.Errorf("decode users: %w", err)
	}
	return users, nil
}

// SearchByUsername does a case-insensitive prefix/contains search.
func (r *UserRepository) SearchByUsername(ctx context.Context, query, excludeID string) ([]User, error) {
	filter := bson.M{
		"_id":      bson.M{"$ne": excludeID},
		"username": bson.M{"$regex": query, "$options": "i"},
	}
	cursor, err := r.coll.Find(
		ctx,
		filter,
		options.Find().SetSort(bson.D{{Key: "username", Value: 1}}).SetLimit(50),
	)
	if err != nil {
		return nil, fmt.Errorf("search users: %w", err)
	}
	defer cursor.Close(ctx)
	var users []User
	if err = cursor.All(ctx, &users); err != nil {
		return nil, fmt.Errorf("decode users: %w", err)
	}
	return users, nil
}
