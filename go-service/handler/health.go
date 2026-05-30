package handler

import (
	"encoding/json"
	"net/http"

	"github.com/nexchat/go-service/hub"
)

// HealthResponse is the JSON body of GET /health.
type HealthResponse struct {
	Status      string   `json:"status"`
	OnlineUsers []string `json:"onlineUsers"`
}

// HealthHandler returns a simple health check with connected user count.
func HealthHandler(h *hub.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(HealthResponse{
			Status:      "ok",
			OnlineUsers: h.OnlineUsers(),
		})
	}
}
