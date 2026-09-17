FROM oven/bun:1.2-alpine

RUN apk add --no-cache curl tar

WORKDIR /app-runner
COPY docker/tenant-runner/server.ts /app-runner/server.ts

WORKDIR /app

ENV PORT=3000 \
    NODE_ENV=production \
    APP_DIR=/app

EXPOSE 3000

CMD ["bun", "run", "/app-runner/server.ts"]
