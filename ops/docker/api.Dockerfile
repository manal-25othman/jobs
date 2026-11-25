# S0 (Package 7, planning files only) — NAQLA API image. Not built or deployed by any pipeline yet.
# Build from the repository root:  docker build -f ops/docker/api.Dockerfile -t naqla-api .
# The API refuses to start without valid production configuration (packages/config): no secret is baked in here.
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/app/package.json ./apps/app/package.json
RUN npm ci --no-audit --no-fund
RUN npm run build -w @naqla/domain && npm run build -w @naqla/config && npm run build -w @naqla/contracts \
 && npm run build -w @naqla/agents && npm run build -w @naqla/api
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /srv
COPY --from=build --chown=node:node /repo /srv
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
