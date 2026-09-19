# =============================================================================
# NexChat — Node.js Backend Service
# =============================================================================

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Production image
FROM node:22-alpine

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files and install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy compiled output from builder stage
COPY --from=builder /app/dist ./dist

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 8080

CMD ["node", "dist/server/index.js"]
