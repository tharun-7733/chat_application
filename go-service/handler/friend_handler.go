package handler

import (
	"encoding/json"
	"net/http"

	"github.com/nexchat/go-service/middleware"
	"github.com/nexchat/go-service/service"
)

type FriendHandler struct {
	friendService *service.FriendService
}

func NewFriendHandler(friendService *service.FriendService) *FriendHandler {
	return &FriendHandler{friendService: friendService}
}

func (h *FriendHandler) GetFriends(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	friends, err := h.friendService.GetFriends(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch friends")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    friends,
	})
}

func (h *FriendHandler) GetPendingRequests(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	requests, err := h.friendService.GetPendingRequests(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch pending requests")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    requests,
	})
}

func (h *FriendHandler) SendRequest(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var req struct {
		AddresseeID string `json:"addresseeId"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	friend, err := h.friendService.SendRequest(r.Context(), userID, req.AddresseeID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"data":    friend,
	})
}

func (h *FriendHandler) AcceptRequest(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	
	friendID := r.PathValue("id")
	if friendID == "" {
		writeError(w, http.StatusBadRequest, "Missing friend ID")
		return
	}

	err := h.friendService.AcceptRequest(r.Context(), userID, friendID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Friend request accepted",
	})
}

func (h *FriendHandler) RejectRequest(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	
	friendID := r.PathValue("id")
	if friendID == "" {
		writeError(w, http.StatusBadRequest, "Missing friend ID")
		return
	}

	err := h.friendService.RejectRequest(r.Context(), userID, friendID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Friend request rejected",
	})
}
