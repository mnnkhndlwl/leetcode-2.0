# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine

# docker CLI — needed to spawn per-submission containers
RUN apk add --no-cache docker-cli

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY main.js config.js health.js judge.js queue.js s3.js ./

# Health check that ECS/ALB can use
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 8080

# The Docker daemon socket must be bind-mounted at runtime:
#   docker run -v /var/run/docker.sock:/var/run/docker.sock ...
CMD ["node", "main.js"]
