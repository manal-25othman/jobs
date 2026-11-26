# S0 (Package 7, planning files only) — NAQLA graduate app (Next.js). Not built or deployed by any pipeline yet.
# Build from the repository root:  docker build -f ops/docker/app.Dockerfile --build-arg NEXT_PUBLIC_API_URL=... -t naqla-app .
FROM node:22-bookworm-slim AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/app ./apps/app
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci --no-audit --no-fund
RUN npm run build -w @naqla/domain && npm run build -w @naqla/config && npm run build -w @naqla/contracts \
 && npm run build -w @naqla/agents && npm run build -w @naqla/app
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /srv
COPY --from=build --chown=node:node /repo /srv
USER node
EXPOSE 3000
WORKDIR /srv/apps/app
CMD ["npx", "next", "start", "-p", "3000"]
