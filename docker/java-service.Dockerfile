# =============================================================================
# NexChat Java Service — Dockerfile
#
# Multi-stage build: keeps the final image lean by separating the
# build environment (full JDK + Maven) from the runtime environment (JRE only).
#
# Stage 1 (builder): Full JDK + Maven → compiles and packages the JAR
# Stage 2 (runtime): JRE only → runs the JAR
#
# Result: ~200MB runtime image vs ~600MB if we kept the full JDK.
#
# ⚠️ PRODUCTION OPTIMIZATION (Phase 6): Spring Boot's layered JARs split
#   the application into layers (dependencies, application code) so that
#   only changed layers are rebuilt in subsequent Docker builds.
# =============================================================================

# Stage 1: Build
FROM maven:3.9-eclipse-temurin-21 AS builder

# Set working directory inside the container
WORKDIR /app

# Copy pom.xml FIRST and download dependencies.
# Docker caches each layer. By copying pom.xml and downloading deps first,
# this layer is only re-executed when pom.xml changes.
# If you copy all source first, ANY source change re-downloads all dependencies.
COPY pom.xml .
RUN mvn dependency:go-offline -B
# -B: batch mode (no progress bars, cleaner logs)
# dependency:go-offline: downloads all Maven deps to local cache

# Now copy source code and build
COPY src ./src
RUN mvn package -DskipTests -B
# -DskipTests: skip tests during Docker build (tests run in CI, not here)
# The JAR is placed at target/nexchat-java-service-*.jar

# Stage 2: Runtime
# eclipse-temurin: the official OpenJDK distribution from the Eclipse Foundation.
# JRE (not JDK): we only need the runtime — no compiler, no Maven.
FROM eclipse-temurin:21-jre-alpine

# Security best practice: don't run as root.
# Create a dedicated user and group for the application process.
RUN addgroup -S nexchat && adduser -S nexchat -G nexchat

WORKDIR /app

# Copy ONLY the packaged JAR from the builder stage.
# Nothing from the full JDK/Maven environment comes with it.
COPY --from=builder /app/target/nexchat-java-service-*.jar app.jar

# Change ownership to the non-root user
RUN chown nexchat:nexchat app.jar

# Switch to non-root user
USER nexchat

# Expose the port the app listens on (documentation, not enforcement)
EXPOSE 8080

# JVM flags:
#   -XX:+UseContainerSupport: makes the JVM aware it's in a container (read cgroup limits)
#   -XX:MaxRAMPercentage=75.0: use up to 75% of the container's memory limit for heap
#   -XX:+ExitOnOutOfMemoryError: crash fast on OOM (better than limping along)
#   -Djava.security.egd: speeds up startup by using /dev/urandom (vs /dev/random)
ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-XX:+ExitOnOutOfMemoryError", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
