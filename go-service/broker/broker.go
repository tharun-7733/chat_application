// Package broker wraps Redis Pub/Sub for cross-instance message delivery.
//
// Channel naming convention: "chat:<userID>"
//
// Flow:
//  1. User A sends a message to User B
//  2. Go instance A publishes JSON to "chat:<userID_B>"
//  3. Redis broadcasts to all subscribers of that channel
//  4. Go instance B (whichever has User B's connection) receives the message
//  5. Instance B calls hub.Send(userID_B, payload) to deliver to the WebSocket
//
// This is the standard fan-out pattern for horizontally scaled WebSocket servers.
// A single Redis instance can handle millions of Pub/Sub messages per second.
package broker

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// Broker wraps a Redis client and provides Publish/Subscribe helpers.
type Broker struct {
	client *redis.Client
}

// New connects to Redis and returns a Broker.
// redisAddr is "host:port", e.g. "localhost:6379".
func New(redisAddr string) (*Broker, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:         redisAddr,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     10,
		MinIdleConns: 2,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping failed: %w", err)
	}

	log.Printf("[broker] connected to Redis at %s", redisAddr)
	return &Broker{client: rdb}, nil
}

// Publish sends payload to the channel "chat:<userID>".
// All Go service instances subscribed to that channel will receive it.
func (b *Broker) Publish(ctx context.Context, userID string, payload []byte) error {
	channel := channelFor(userID)
	return b.client.Publish(ctx, channel, payload).Err()
}

// Subscribe listens on "chat:<userID>" and calls handler for every message.
// Runs until ctx is cancelled. Designed to run in its own goroutine.
func (b *Broker) Subscribe(ctx context.Context, userID string, handler func(payload []byte)) {
	channel := channelFor(userID)
	sub := b.client.Subscribe(ctx, channel)
	defer sub.Close()

	log.Printf("[broker] subscribed to %s", channel)
	ch := sub.Channel()

	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				log.Printf("[broker] channel closed for %s", channel)
				return
			}
			handler([]byte(msg.Payload))

		case <-ctx.Done():
			log.Printf("[broker] unsubscribed from %s", channel)
			return
		}
	}
}

// SetPresence stores user online status in Redis with a TTL.
// Key: "presence:<userID>", Value: "online", TTL: 90 seconds.
// The Go service must refresh this every ~60s (via ping/pong heartbeat).
func (b *Broker) SetPresence(ctx context.Context, userID string, online bool) error {
	key := fmt.Sprintf("presence:%s", userID)
	if online {
		return b.client.Set(ctx, key, "online", 90*time.Second).Err()
	}
	return b.client.Del(ctx, key).Err()
}

// IsOnline checks whether a user has an active presence key.
func (b *Broker) IsOnline(ctx context.Context, userID string) bool {
	key := fmt.Sprintf("presence:%s", userID)
	val, err := b.client.Get(ctx, key).Result()
	return err == nil && val == "online"
}

func channelFor(userID string) string {
	return fmt.Sprintf("chat:%s", userID)
}
