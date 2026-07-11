FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/log/package.json packages/log/package.json
COPY packages/money/package.json packages/money/package.json
COPY packages/email-templates/package.json packages/email-templates/package.json
COPY services/worker/package.json services/worker/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @ai-fsm/web build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
# Docker sets HOSTNAME to the container ID by default; Next's standalone
# server.js binds to that unless overridden, which makes it unreachable via
# localhost (breaks the healthcheck) even though it's reachable on the
# container's network IP.
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "server.js"]
