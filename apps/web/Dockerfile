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
COPY . .
RUN pnpm --filter @ai-fsm/web build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["pnpm", "--filter", "@ai-fsm/web", "start"]
