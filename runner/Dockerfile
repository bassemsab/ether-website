FROM oven/bun:1

WORKDIR /app

# Install git, curl, ca-certificates, procps, tmux
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    procps \
    tmux \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Antigravity CLI flat native build into /usr/local/bin
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash -s -- -d /usr/local/bin

# Copy runner source files
COPY runner/ ./runner/

# Create persistent storage directory
RUN mkdir -p /data/profiles /data/tenants

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

EXPOSE 8080

CMD ["bun", "run", "runner/server.ts"]
