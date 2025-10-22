# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install all dependencies (including dev) for building
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client (no DB connection required)
RUN npx prisma generate

# Build NestJS to dist
RUN npm run build

# Inspect build output for debugging
RUN ls -la dist && echo "-----" && ls -la dist || true && echo "Recursive dist tree:" && (ls -R dist || true)

# Production stage
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Copy only what we need
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Remove dev dependencies to slim image
RUN npm prune --production

# Render exposes port 10000
EXPOSE 10000

# Start compiled app
CMD ["sh", "-c", "if [ -f dist/main.js ]; then node dist/main.js; elif [ -f dist/src/main.js ]; then node dist/src/main.js; elif [ -f dist/main.mjs ]; then node dist/main.mjs; elif [ -f dist/src/main.mjs ]; then node dist/src/main.mjs; else echo 'No entry file found in dist. Expected one of: dist/main.js, dist/src/main.js, dist/main.mjs, dist/src/main.mjs' && ls -R dist || true && exit 1; fi"]
