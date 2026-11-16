# The platform in one container (spec/deployment.md): the gateway, serving the built page from the same origin.

# Build the page to call the gateway over HTTP.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:web

# Run the gateway with production dependencies only.
FROM node:22-slim
ENV NODE_ENV=production \
    LSH_STATIC_DIR=/app/dist \
    LSH_GATEWAY_JOURNAL=/tmp/lsh/journal.jsonl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
COPY ontology ./ontology
COPY data ./data
COPY --from=build /app/dist ./dist
RUN mkdir -p /tmp/lsh && chown -R node:node /tmp/lsh
USER node
EXPOSE 8080
CMD ["npx", "tsx", "src/gateway/main.ts"]
