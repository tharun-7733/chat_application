# =============================================================================
# NexChat — Go WebSocket Service Dockerfile
#
# Multi-stage build:
#   Stage 1 (builder): compile the Go binary with CGO disabled
#   Stage 2 (runner):  minimal alpine image with just the binary
#
# Result: ~12MB final image vs ~800MB for golang:latest
# =============================================================================

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM golang:1.24-alpine AS builder

# Install git (needed if go mod downloads from VCS) and ca-certificates
RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Copy go.mod and go.sum first for layer caching.
# Docker caches each layer. If only source code changes (not dependencies),
# this layer is reused and `go mod download` is NOT re-run.
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build with CGO disabled for a fully static binary.
# -ldflags="-w -s": strip debug info and symbol table → smaller binary
# GOOS=linux: cross-compile for Linux (since we're on macOS/ARM in dev)
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s" \
    -o /bin/go-service \
    ./...

# ── Stage 2: Run ──────────────────────────────────────────────────────────────
FROM alpine:3.20

# ca-certificates: needed for HTTPS calls (to Java service)
# wget: needed for Docker healthcheck
RUN apk add --no-cache ca-certificates wget

# Non-root user for security
# Never run production containers as root.
RUN addgroup -g 1001 -S nexchat && \
    adduser -u 1001 -S nexchat -G nexchat

WORKDIR /app

# Copy the compiled binary from builder stage
COPY --from=builder /bin/go-service .

# Switch to non-root user
USER nexchat

# WebSocket service port
EXPOSE 8081

# Health check: poll the /health endpoint every 15 seconds
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8081/health || exit 1

ENTRYPOINT ["./go-service"]
