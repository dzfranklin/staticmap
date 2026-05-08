FROM node:20-bookworm AS builder
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
  libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY --from=builder /app/node_modules ./app/node_modules
COPY --from=builder /app/dist ./app/dist
COPY sources.json /sources.json
COPY public /public
EXPOSE 3000
ENTRYPOINT ["node", "--enable-source-maps", "/app/dist/src/server.js"]
