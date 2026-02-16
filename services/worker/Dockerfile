FROM node:20-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY services/worker/package.json services/worker/package.json
RUN pnpm install --frozen-lockfile=false
COPY services/worker services/worker
CMD ["pnpm", "--filter", "@ai-fsm/worker", "dev"]
