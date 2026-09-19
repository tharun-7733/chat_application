package handler

import (
	"net/http"
	"strconv"

	"github.com/nexchat/go-service/middleware"
	"github.com/nexchat/go-service/service"
)

type MessagesHandler struct {
	chatService *service.ChatService
}

func NewMessagesHandler(chatService *service.ChatService) *MessagesHandler {
	return &MessagesHandler{chatService: chatService}
}

// GET /api/messages/{contactId}?limit=50
// Returns the conversation history between the authenticated user and contactId.
// Messages are returned oldest-first so the frontend can render them top-to-bottom.
func (h *MessagesHandler) GetHistory(w http.ResponseWriter, r *http.Request) {
	callerID := middleware.GetUserID(r.Context())
	if callerID == "" {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	contactID := r.PathValue("contactId")
	if contactID == "" {
		writeError(w, http.StatusBadRequest, "Missing contactId")
		return
	}

	var limit int64 = 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.ParseInt(l, 10, 64); err == nil && n > 0 {
			limit = n
		}
	}

	msgs, err := h.chatService.GetHistory(r.Context(), callerID, contactID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch messages")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    msgs,
	})
}
