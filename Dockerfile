# Use lightweight Node.js base image
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application code
COPY server.js ./
COPY public/ ./public/
COPY README.md ./

# Runner stage
FROM node:20-alpine

WORKDIR /app

# Copy built app and dependencies from builder
COPY --from=builder /app /app

# Expose port
EXPOSE 3000

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Run the backend proxy server
CMD ["node", "server.js"]
