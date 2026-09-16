# =============================================================================
# NexChat — Makefile
# Developer shortcuts for common tasks.
# Usage: make <target>  (e.g., make node-run, make db-up, make go-run)
# =============================================================================

NODE_BACKEND  := backend
GO_SERVICE    := go-service

.PHONY: help db-up db-down node-build node-run node-test go-run go-build go-tidy clean

help:
	@echo "NexChat Developer Commands:"
	@echo "  make db-up       - Start MongoDB + Redis (Docker)"
	@echo "  make db-down     - Stop and remove DB containers"
	@echo "  make node-build  - Compile the Node.js backend"
	@echo "  make node-run    - Run the Node.js backend locally (needs DB running)"
	@echo "  make node-test   - Run unit tests for Node.js backend"
	@echo "  make go-run      - Run the Go WebSocket service locally"
	@echo "  make go-build    - Build the Go binary"
	@echo "  make go-tidy     - Run go mod tidy"
	@echo "  make clean       - Clean all build artifacts"

db-up:
	docker compose up -d mongodb redis

db-down:
	docker compose down

node-build:
	cd $(NODE_BACKEND) && npm run build

node-run:
	@echo "Starting Node.js service (ensure MongoDB is running first: make db-up)"
	cd $(NODE_BACKEND) && \
	MONGO_URI=mongodb://localhost:27017/nexchat \
	REDIS_URL=redis://localhost:6379 \
	JWT_SECRET=dev-secret-key-minimum-32-bytes-long \
	INTERNAL_SECRET=nexchat-internal-dev-secret \
	FRONTEND_URL=http://localhost:5173 \
	npm run dev

node-test:
	cd $(NODE_BACKEND) && npm test

go-run:
	@echo "Starting Go WebSocket service (ensure DB is running: make db-up)"
	cd $(GO_SERVICE) && \
	PORT=8081 \
	JWT_SECRET=dev-secret-key-minimum-32-bytes-long \
	REDIS_URL=localhost:6379 \
	NODE_SERVICE_URL=http://localhost:8080 \
	INTERNAL_SECRET=nexchat-internal-dev-secret \
	go run ./...

go-build:
	cd $(GO_SERVICE) && go build -o ../bin/go-service ./...

go-tidy:
	cd $(GO_SERVICE) && go mod tidy

clean:
	rm -rf $(NODE_BACKEND)/dist
	rm -f bin/go-service
