# ---- build stage ----
FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts vitest.config.ts index.html ./
COPY src ./src
COPY public ./public

RUN bun run build

# ---- serve stage ----
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
