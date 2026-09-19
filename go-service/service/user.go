package service

import (
	"context"
	"fmt"

	"github.com/nexchat/go-service/repository"
)

type UserService struct {
	userRepo *repository.UserRepository
}

func NewUserService(userRepo *repository.UserRepository) *UserService {
	return &UserService{userRepo: userRepo}
}

func (s *UserService) GetUserByID(ctx context.Context, id string) (*repository.User, error) {
	return s.userRepo.FindByID(ctx, id)
}

// GetPublicProfile returns a user's public info (no email) by their ID.
func (s *UserService) GetPublicProfile(ctx context.Context, id string) (*repository.PublicUser, error) {
	u, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, nil
	}
	return &repository.PublicUser{
		ID:            u.ID,
		Username:      u.Username,
		AvatarURL:     u.AvatarURL,
		StatusMessage: u.StatusMessage,
		LastSeen:      u.LastSeen,
	}, nil
}

// SearchUsers returns matching users excluding the caller.
// If query is empty, returns all users (up to 200).
func (s *UserService) SearchUsers(ctx context.Context, query, excludeID string) ([]repository.PublicUser, error) {
	var (
		users []repository.User
		err   error
	)

	if query == "" {
		users, err = s.userRepo.FindAll(ctx, excludeID)
	} else {
		// Escape regex special chars to prevent injection
		safe := fmt.Sprintf("%s", regexEscape(query))
		users, err = s.userRepo.SearchByUsername(ctx, safe, excludeID)
	}
	if err != nil {
		return nil, err
	}

	result := make([]repository.PublicUser, 0, len(users))
	for _, u := range users {
		result = append(result, repository.PublicUser{
			ID:            u.ID,
			Username:      u.Username,
			AvatarURL:     u.AvatarURL,
			StatusMessage: u.StatusMessage,
			LastSeen:      u.LastSeen,
		})
	}
	return result, nil
}

// regexEscape escapes characters that have special meaning in MongoDB regex.
func regexEscape(s string) string {
	special := `\.+*?()|[]{}^$`
	out := make([]byte, 0, len(s)*2)
	for i := 0; i < len(s); i++ {
		for j := 0; j < len(special); j++ {
			if s[i] == special[j] {
				out = append(out, '\\')
				break
			}
		}
		out = append(out, s[i])
	}
	return string(out)
}

