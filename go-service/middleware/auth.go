// Package middleware provides HTTP middleware for the Go WebSocket service.
package middleware

import (
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims is the JWT payload structure (matches Java's JwtService).
type Claims struct {
	jwt.RegisteredClaims
	// Type is the custom claim added by Java: "ACCESS" or "REFRESH"
	Type string `json:"type"`
}

// ValidateJWT parses and validates a JWT token string.
// Returns the userID (UUID string) extracted from the 'sub' claim.
//
// ⚠️ Must use the same secret and algorithm (HS256) as the Java JwtService.
func ValidateJWT(tokenStr, secret string) (string, error) {
	// Strip "Bearer " prefix if present (some clients send it)
	tokenStr = strings.TrimPrefix(tokenStr, "Bearer ")
	tokenStr = strings.TrimSpace(tokenStr)

	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		// Enforce the algorithm: reject tokens signed with RS256, EdDSA, etc.
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})

	if err != nil {
		return "", fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return "", fmt.Errorf("invalid token claims")
	}

	// Reject refresh tokens — WebSocket connections must use access tokens only
	if claims.Type != "ACCESS" {
		return "", fmt.Errorf("expected ACCESS token, got %s", claims.Type)
	}

	// Check expiry explicitly (jwt.ParseWithClaims does this, but belt-and-suspenders)
	if claims.ExpiresAt != nil && claims.ExpiresAt.Before(time.Now()) {
		return "", fmt.Errorf("token expired")
	}

	userID := claims.Subject
	if userID == "" {
		return "", fmt.Errorf("missing subject claim")
	}

	return userID, nil
}
