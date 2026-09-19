package handler

import (
	"net/http"

	"github.com/nexchat/go-service/middleware"
	"github.com/nexchat/go-service/service"
)

type UserHandler struct {
	userService *service.UserService
}

func NewUserHandler(userService *service.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

// GET /api/users/me — returns the authenticated user's full profile.
func (h *UserHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	user, err := h.userService.GetUserByID(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch user profile")
		return
	}
	if user == nil {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    user, // PasswordHash excluded via json:"-"
	})
}

// GET /api/users/search?q= — search users by username, excludes the caller.
func (h *UserHandler) SearchUsers(w http.ResponseWriter, r *http.Request) {
	callerID := middleware.GetUserID(r.Context())
	q := r.URL.Query().Get("q")

	users, err := h.userService.SearchUsers(r.Context(), q, callerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Search failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    users,
	})
}

// GET /api/users/{id} — public profile (no email) for any user.
func (h *UserHandler) GetUserByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Missing user ID")
		return
	}

	profile, err := h.userService.GetPublicProfile(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch user")
		return
	}
	if profile == nil {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    profile,
	})
}

