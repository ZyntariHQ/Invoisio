# Build stage
FROM node:18-alpine AS builder

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

# Production stage
FROM node:18-alpine AS production
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
CMD ["node", "dist/main"]
