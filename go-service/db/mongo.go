// Package db manages the MongoDB connection for the Go service.
//
// Design:
//   - Single client, created at startup, reused for the process lifetime.
//   - Connection pool is handled by the driver (default: 100 connections max).
//   - Context-aware: all operations accept a context for timeout propagation.
package db

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
)

// Connect dials MongoDB using the provided URI and verifies the connection.
// Returns the connected client and a cleanup function to call on shutdown.
//
// Usage:
//
//	client, close, err := db.Connect(ctx, "mongodb://localhost:27017")
//	defer close()
func Connect(ctx context.Context, uri string) (*mongo.Client, func(), error) {
	opts := options.Client().
		ApplyURI(uri).
		SetConnectTimeout(10 * time.Second).
		SetServerSelectionTimeout(10 * time.Second)

	client, err := mongo.Connect(opts)
	if err != nil {
		return nil, nil, fmt.Errorf("mongo.Connect: %w", err)
	}

	// Verify connectivity with a ping
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := client.Ping(pingCtx, readpref.Primary()); err != nil {
		_ = client.Disconnect(ctx)
		return nil, nil, fmt.Errorf("mongo ping failed: %w", err)
	}

	log.Printf("[db] connected to MongoDB at %s", uri)

	cleanup := func() {
		disconnectCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := client.Disconnect(disconnectCtx); err != nil {
			log.Printf("[db] disconnect error: %v", err)
		} else {
			log.Println("[db] MongoDB connection closed")
		}
	}

	return client, cleanup, nil
}
