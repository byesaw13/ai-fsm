FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY services/worker/package.json services/worker/package.json
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY services/worker/src services/worker/src
COPY services/worker/tsconfig.json services/worker/tsconfig.json
RUN pnpm --filter @ai-fsm/worker build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/worker/package.json ./services/worker/package.json
COPY --from=build /app/services/worker/node_modules ./services/worker/node_modules
COPY --from=build /app/services/worker/dist ./services/worker/dist
CMD ["node", "services/worker/dist/index.js"]
