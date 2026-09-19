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

type FriendshipStatus string

const (
	FriendshipStatusPending  FriendshipStatus = "PENDING"
	FriendshipStatusAccepted FriendshipStatus = "ACCEPTED"
	FriendshipStatusBlocked  FriendshipStatus = "BLOCKED"
)

type Friend struct {
	ID          string           `bson:"_id"`
	RequesterID string           `bson:"requesterId"`
	AddresseeID string           `bson:"addresseeId"`
	Status      FriendshipStatus `bson:"status"`
	CreatedAt   time.Time        `bson:"createdAt"`
	UpdatedAt   time.Time        `bson:"updatedAt"`
}

type FriendRepository struct {
	coll *mongo.Collection
}

func NewFriendRepository(ctx context.Context, db *mongo.Database) (*FriendRepository, error) {
	coll := db.Collection("friends")

	// Create unique compound index (requesterId, addresseeId)
	indexModel := mongo.IndexModel{
		Keys:    bson.D{{Key: "requesterId", Value: 1}, {Key: "addresseeId", Value: 1}},
		Options: options.Index().SetUnique(true),
	}
	_, err := coll.Indexes().CreateOne(ctx, indexModel)
	if err != nil {
		return nil, fmt.Errorf("create friend index: %w", err)
	}

	return &FriendRepository{coll: coll}, nil
}

func (r *FriendRepository) FindFriendship(ctx context.Context, userID1, userID2 string) (*Friend, error) {
	var friend Friend
	err := r.coll.FindOne(ctx, bson.M{
		"$or": []bson.M{
			{"requesterId": userID1, "addresseeId": userID2},
			{"requesterId": userID2, "addresseeId": userID1},
		},
	}).Decode(&friend)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, fmt.Errorf("find friendship: %w", err)
	}
	return &friend, nil
}

func (r *FriendRepository) Create(ctx context.Context, requesterID, addresseeID string) (*Friend, error) {
	now := time.Now().UTC()
	friend := &Friend{
		ID:          uuid.New().String(),
		RequesterID: requesterID,
		AddresseeID: addresseeID,
		Status:      FriendshipStatusPending,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	_, err := r.coll.InsertOne(ctx, friend)
	if err != nil {
		return nil, fmt.Errorf("insert friend: %w", err)
	}
	return friend, nil
}

func (r *FriendRepository) UpdateStatus(ctx context.Context, id string, status FriendshipStatus) error {
	_, err := r.coll.UpdateOne(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{"status": status, "updatedAt": time.Now().UTC()}},
	)
	return err
}

func (r *FriendRepository) Delete(ctx context.Context, id string) error {
	_, err := r.coll.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

func (r *FriendRepository) FindPendingByAddressee(ctx context.Context, addresseeID string) ([]Friend, error) {
	cursor, err := r.coll.Find(ctx, bson.M{"addresseeId": addresseeID, "status": FriendshipStatusPending})
	if err != nil {
		return nil, fmt.Errorf("find pending requests: %w", err)
	}
	defer cursor.Close(ctx)

	var friends []Friend
	if err = cursor.All(ctx, &friends); err != nil {
		return nil, fmt.Errorf("decode friends: %w", err)
	}
	return friends, nil
}

func (r *FriendRepository) FindAcceptedByUserID(ctx context.Context, userID string) ([]Friend, error) {
	cursor, err := r.coll.Find(ctx, bson.M{
		"$or": []bson.M{
			{"requesterId": userID, "status": FriendshipStatusAccepted},
			{"addresseeId": userID, "status": FriendshipStatusAccepted},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("find accepted friends: %w", err)
	}
	defer cursor.Close(ctx)

	var friends []Friend
	if err = cursor.All(ctx, &friends); err != nil {
		return nil, fmt.Errorf("decode friends: %w", err)
	}
	return friends, nil
}
