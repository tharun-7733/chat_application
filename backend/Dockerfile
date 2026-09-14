# ─────────────────────────────────────────────────────────────────────────────
# NexChat Node.js Service — Dockerfile
#
# Multi-stage build:
#   Stage 1 (builder): Full Node.js + TypeScript → compiles TS to JS
#   Stage 2 (runtime): Minimal node:alpine → runs compiled JS
#
# Final image: ~150MB (vs ~600MB if we kept all devDependencies)
#
# ⚠️  Build context: the entire `backend/` directory.
#    Run from repo root: docker build -f docker/node-service.Dockerfile ./backend
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first — Docker caches this layer.
# If only source files change, npm ci is NOT re-run (faster builds).
COPY package.json package-lock.json* ./

# ci: clean install — uses package-lock.json exactly (reproducible)
# --include=dev: we need TypeScript compiler in the builder stage
RUN npm ci --include=dev

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript → dist/
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Security: run as non-root user
RUN addgroup -S nexchat && adduser -S nexchat -G nexchat

WORKDIR /app

# Copy compiled JS from builder stage
COPY --from=builder /app/dist ./dist

# Copy package files and install ONLY production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Change ownership to non-root user
RUN chown -R nexchat:nexchat /app
USER nexchat

# Document the port this service listens on
EXPOSE 3000

# Health check: Docker will mark the container unhealthy if this fails.
# Gives the service 30s to start (MongoDB + Redis connections take time).
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Start the compiled server
CMD ["node", "dist/server/index.js"]
