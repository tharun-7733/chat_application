# =============================================================================
# NexChat — Makefile
# Developer shortcuts for common tasks.
# Usage: make <target>  (e.g., make java-run, make db-up, make go-run)
# =============================================================================

# Java 23 home (matches installed JDK on this machine)
JAVA_HOME_23 := /Library/Java/JavaVirtualMachines/jdk-23.jdk/Contents/Home
JAVA_SERVICE  := java-service
GO_SERVICE    := go-service

.PHONY: help db-up db-down java-build java-run java-test go-run go-build go-tidy clean

help:
	@echo "NexChat Developer Commands:"
	@echo "  make db-up       - Start PostgreSQL + Redis (Docker)"
	@echo "  make db-down     - Stop and remove DB containers"
	@echo "  make java-build  - Compile the Java service"
	@echo "  make java-run    - Run the Java service locally (needs DB running)"
	@echo "  make java-test   - Run unit tests"
	@echo "  make go-run      - Run the Go WebSocket service locally"
	@echo "  make go-build    - Build the Go binary"
	@echo "  make go-tidy     - Run go mod tidy"
	@echo "  make clean       - Clean all build artifacts"

db-up:
	docker compose up -d postgres redis

db-down:
	docker compose down

java-build:
	JAVA_HOME=$(JAVA_HOME_23) mvn clean compile -f $(JAVA_SERVICE)/pom.xml

java-run:
	@echo "Starting Java service (ensure PostgreSQL is running first: make db-up)"
	JAVA_HOME=$(JAVA_HOME_23) \
	DB_HOST=localhost \
	DB_PORT=5432 \
	DB_NAME=nexchat \
	DB_USERNAME=nexchat_user \
	DB_PASSWORD=nexchat_pass \
	JWT_SECRET=dev-secret-key-minimum-32-bytes-long \
	INTERNAL_SECRET=nexchat-internal-dev-secret \
	FRONTEND_URL=http://localhost:5173 \
	mvn spring-boot:run -f $(JAVA_SERVICE)/pom.xml

java-test:
	JAVA_HOME=$(JAVA_HOME_23) mvn test -f $(JAVA_SERVICE)/pom.xml

go-run:
	@echo "Starting Go WebSocket service (ensure DB is running: make db-up)"
	cd $(GO_SERVICE) && \
	PORT=8081 \
	JWT_SECRET=dev-secret-key-minimum-32-bytes-long \
	REDIS_URL=localhost:6379 \
	JAVA_SERVICE_URL=http://localhost:8080 \
	INTERNAL_SECRET=nexchat-internal-dev-secret \
	go run ./...

go-build:
	cd $(GO_SERVICE) && go build -o ../bin/go-service ./...

go-tidy:
	cd $(GO_SERVICE) && go mod tidy

clean:
	mvn clean -f $(JAVA_SERVICE)/pom.xml
	rm -f bin/go-service
