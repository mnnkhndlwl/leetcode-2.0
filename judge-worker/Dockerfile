# ── Build stage ────────────────────────────────────────────────────────────────
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Download dependencies first (layer-cached unless go.mod/go.sum change)
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Statically link so the binary runs in a minimal runtime image
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /judge-worker ./cmd/worker

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM alpine:3.20

# docker CLI — needed to spawn per-submission containers
RUN apk add --no-cache ca-certificates docker-cli

WORKDIR /app

COPY --from=builder /judge-worker .

# Health check that ECS/ALB can use
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

EXPOSE 8080

# The Docker daemon socket must be bind-mounted at runtime:
#   docker run -v /var/run/docker.sock:/var/run/docker.sock ...
CMD ["./judge-worker"]
