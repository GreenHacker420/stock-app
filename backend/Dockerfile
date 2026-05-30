# syntax=docker/dockerfile:1.7

# ---------- Stage 1: Dependencies ----------
FROM node:24-slim AS deps
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

# Install production dependencies only
COPY package*.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# ---------- Stage 2: Builder ----------
FROM node:24-slim AS builder
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

# Install all dependencies including devDependencies
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy source and generate Prisma
COPY . .
RUN npx prisma generate

# No build step as this is a JS project
# If it were TS: RUN npm run build

# ---------- Stage 3: Runtime ----------
FROM node:24-slim AS runner

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -m nodejs

# Copy production node_modules and source
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Set permissions
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Production environment
ENV NODE_ENV=production
ENV PORT=6600
# Optimize memory for container limits
ENV NODE_OPTIONS="--max-old-space-size=450 --enable-source-maps"

EXPOSE 6600

# Healthcheck hitting the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:6600/health', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Use exec form for proper signal handling
CMD ["node", "src/index.js"]
