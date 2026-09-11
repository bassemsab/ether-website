# Use the official Bun image
FROM oven/bun:1 as base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Production image
FROM oven/bun:1 as runner
WORKDIR /app

# Copy built assets from base
COPY --from=base /app/build ./build
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./

# Install kubectl and curl for cluster tenant orchestration
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -LO "https://dl.k8s.io/release/v1.32.0/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && mv kubectl /usr/local/bin/ && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create data directory for SQLite
RUN mkdir -p /data


# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/visitors.sqlite

# Expose port
EXPOSE 3000

# Start the application
CMD ["bun", "run", "build/index.js"]
