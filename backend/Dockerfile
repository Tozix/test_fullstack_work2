FROM oven/bun:1

WORKDIR /app

# Copy lockfile + manifest first for cached installs.
COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile || bun install

# Source + tsconfig.
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

ENV PORT=3001
EXPOSE 3001

# Dev-mode entrypoint — runs Nest under bun's file watcher.
CMD ["bun", "run", "start:dev"]
