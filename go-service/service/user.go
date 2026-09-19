package service

import (
	"context"

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
