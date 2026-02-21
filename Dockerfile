FROM oven/bun:1.3.9 AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/cli/package.json ./packages/cli/package.json
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build:release

FROM oven/bun:1.3.9-slim AS runtime

WORKDIR /app

COPY --from=builder /app/dist/cia /usr/local/bin/cia
RUN chmod 755 /usr/local/bin/cia

USER bun
CMD ["cia"]
