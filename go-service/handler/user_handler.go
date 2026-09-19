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

	// Remove password hash from response
	user.PasswordHash = ""

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    user,
	})
}
