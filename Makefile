# =============================================================================
# NexChat — Makefile
# Developer shortcuts for common tasks.
# Usage: make <target>  (e.g., make java-run, make db-up)
# =============================================================================

# Java 23 home (matches installed JDK on this machine)
JAVA_HOME_23 := /Library/Java/JavaVirtualMachines/jdk-23.jdk/Contents/Home
JAVA_SERVICE  := java-service

.PHONY: help db-up db-down java-build java-run java-test clean

help:
	@echo "NexChat Developer Commands:"
	@echo "  make db-up       - Start PostgreSQL + Redis (Docker)"
	@echo "  make db-down     - Stop and remove DB containers"
	@echo "  make java-build  - Compile the Java service"
	@echo "  make java-run    - Run the Java service locally (needs DB running)"
	@echo "  make java-test   - Run unit tests"
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
	FRONTEND_URL=http://localhost:5173 \
	mvn spring-boot:run -f $(JAVA_SERVICE)/pom.xml

java-test:
	JAVA_HOME=$(JAVA_HOME_23) mvn test -f $(JAVA_SERVICE)/pom.xml

clean:
	mvn clean -f $(JAVA_SERVICE)/pom.xml
