# ==============================================================================
# Stage 1: Build Web Frontend Assets
# ==============================================================================
FROM node:22-alpine AS web-builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

RUN npm run build --workspace=@reference-vault/web

# ==============================================================================
# Stage 2: Build Go Server Executable
# ==============================================================================
FROM golang:1.26-alpine AS go-builder

WORKDIR /app/apps/server

COPY apps/server/go.mod apps/server/go.sum ./
RUN go mod download

COPY apps/server ./

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/server-bin ./cmd/server

# ==============================================================================
# Stage 3: Lightweight Production Runtime Environment
# ==============================================================================
FROM alpine:latest AS runner

WORKDIR /app

RUN apk add --no-cache ffmpeg tini ca-certificates tzdata

ENV PORT=4310
ENV HOST=0.0.0.0
ENV DEFAULT_LIBRARY_PATH=/library
ENV WEB_DIST_PATH=/app/apps/web/dist

RUN mkdir -p /library /app/apps/web/dist

COPY --from=go-builder /app/server-bin /app/server
COPY --from=web-builder /app/apps/web/dist /app/apps/web/dist

EXPOSE 4310

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/server"]
