# NAQLA API image (staging first). Built by CI (docker-build job); deployed only after the owner's approval.
# Build from the repository root:  docker build -f ops/docker/api.Dockerfile -t naqla-api .
# The API refuses to start without valid production configuration (packages/config): no secret is baked in here.
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/app/package.json ./apps/app/package.json
# Every npm workspace must exist for `npm ci`; the runner's code is NOT shipped (untrusted code never runs on the API host).
COPY apps/runner/package.json ./apps/runner/package.json
RUN npm ci --no-audit --no-fund
RUN npm run build -w @naqla/domain && npm run build -w @naqla/config && npm run build -w @naqla/contracts \
 && npm run build -w @naqla/agents && npm run build -w @naqla/api
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /srv
COPY --from=build --chown=node:node /repo /srv
# Content the API reads at runtime: the pilot candidate data (simulated GitHub repositories, recorded R2 results,
# scenarios), the migrations and the data CLI used by the one-off database setup job.
COPY --chown=node:node data ./data
COPY --chown=node:node supabase ./supabase
COPY --chown=node:node scripts ./scripts
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/src/main.js"]
