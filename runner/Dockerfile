FROM oven/bun:1

WORKDIR /app

# Install git, curl, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy runner source files
COPY runner/ ./runner/

# Create persistent storage directory
RUN mkdir -p /data/profiles /data/tenants

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

EXPOSE 8080

CMD ["bun", "run", "runner/server.ts"]
