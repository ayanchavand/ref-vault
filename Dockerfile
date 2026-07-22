# ==============================================================================
# Stage 1: Build & Dependencies
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root and package manifests for workspace dependency caching
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies
RUN npm ci

# Copy source workspace files
COPY apps/ ./apps/
COPY packages/ ./packages/

# Typecheck typescript workspaces and build web app static assets
RUN npm run typecheck
RUN npm run build --workspace=@reference-vault/web

# Remove devDependencies to produce lean node_modules
RUN npm prune --omit=dev

# ==============================================================================
# Stage 2: Production Runtime Environment
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

# Install system runtime dependencies: FFmpeg, FFprobe, and tini (for PID 1 signal forwarding)
RUN apk add --no-cache ffmpeg tini

ENV NODE_ENV=production
ENV PORT=4310
ENV HOST=0.0.0.0
ENV DEFAULT_LIBRARY_PATH=/library

# Create default reference library mount directory
RUN mkdir -p /library && chown -R node:node /app /library

# Copy production workspace node_modules and built application assets
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/server ./apps/server
COPY --from=builder /app/apps/web/dist ./apps/web/dist

USER node

EXPOSE 4310

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "start", "--workspace=@reference-vault/server"]
