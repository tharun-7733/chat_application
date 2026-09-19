package service

import (
	"context"
	"fmt"

	"github.com/nexchat/go-service/repository"
)

type FriendService struct {
	friendRepo *repository.FriendRepository
}

func NewFriendService(friendRepo *repository.FriendRepository) *FriendService {
	return &FriendService{friendRepo: friendRepo}
}

func (s *FriendService) SendRequest(ctx context.Context, requesterID, addresseeID string) (*repository.Friend, error) {
	if requesterID == addresseeID {
		return nil, fmt.Errorf("cannot add yourself")
	}

	existing, err := s.friendRepo.FindFriendship(ctx, requesterID, addresseeID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, fmt.Errorf("friendship already exists or pending")
	}

	return s.friendRepo.Create(ctx, requesterID, addresseeID)
}

func (s *FriendService) AcceptRequest(ctx context.Context, userID, friendID string) error {
	// Need to find the friend request where addressee is userID and requester is friendID
	// To simplify, we just find the existing friendship and update it
	existing, err := s.friendRepo.FindFriendship(ctx, userID, friendID)
	if err != nil {
		return err
	}
	if existing == nil {
		return fmt.Errorf("friend request not found")
	}
	if existing.Status != repository.FriendshipStatusPending {
		return fmt.Errorf("request not pending")
	}

	return s.friendRepo.UpdateStatus(ctx, existing.ID, repository.FriendshipStatusAccepted)
}

func (s *FriendService) RejectRequest(ctx context.Context, userID, friendID string) error {
	existing, err := s.friendRepo.FindFriendship(ctx, userID, friendID)
	if err != nil {
		return err
	}
	if existing == nil {
		return fmt.Errorf("friend request not found")
	}

	return s.friendRepo.Delete(ctx, existing.ID)
}

func (s *FriendService) GetFriends(ctx context.Context, userID string) ([]repository.Friend, error) {
	return s.friendRepo.FindAcceptedByUserID(ctx, userID)
}

func (s *FriendService) GetPendingRequests(ctx context.Context, userID string) ([]repository.Friend, error) {
	return s.friendRepo.FindPendingByAddressee(ctx, userID)
}
