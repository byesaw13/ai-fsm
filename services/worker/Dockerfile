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
COPY packages/log packages/log
COPY packages/money packages/money
COPY packages/email-templates packages/email-templates
COPY packages/domain/src/promise-capture.ts packages/domain/src/promise-capture.ts
COPY packages/domain/package.json packages/domain/package.json
COPY services/worker services/worker
RUN pnpm --filter @ai-fsm/log --filter @ai-fsm/money --filter @ai-fsm/email-templates --filter @ai-fsm/worker build \
 && pnpm exec tsc packages/domain/src/promise-capture.ts --module commonjs --target ES2022 --rootDir packages/domain/src --outDir packages/domain/dist --esModuleInterop --skipLibCheck

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/log/package.json ./packages/log/package.json
COPY --from=build /app/packages/log/dist ./packages/log/dist
COPY --from=build /app/packages/money/package.json ./packages/money/package.json
COPY --from=build /app/packages/money/dist ./packages/money/dist
COPY --from=build /app/packages/email-templates/package.json ./packages/email-templates/package.json
COPY --from=build /app/packages/email-templates/dist ./packages/email-templates/dist
COPY --from=build /app/packages/domain/package.json ./packages/domain/package.json
COPY --from=build /app/packages/domain/dist ./packages/domain/dist
COPY --from=build /app/services/worker/package.json ./services/worker/package.json
COPY --from=build /app/services/worker/node_modules ./services/worker/node_modules
COPY --from=build /app/services/worker/dist ./services/worker/dist
# Workspace packages point main at src/ for dev; production runs compiled dist/.
RUN sed -i 's|"main": "src/index.ts"|"main": "dist/index.js"|' \
      packages/log/package.json \
      packages/money/package.json \
      packages/email-templates/package.json \
 && sed -i 's|"types": "src/index.ts"|"types": "dist/index.d.ts"|' \
      packages/log/package.json \
      packages/money/package.json \
      packages/email-templates/package.json \
 && sed -i \
      -e 's|"./src/web.ts"|"./dist/web.js"|g' \
      -e 's|"./src/worker.ts"|"./dist/worker.js"|g' \
      -e 's|"./src/mcp.ts"|"./dist/mcp.js"|g' \
      -e 's|"./src/index.ts"|"./dist/index.js"|g' \
      packages/log/package.json \
 && sed -i \
      -e 's|"main": "src/index.ts"|"main": "dist/promise-capture.js"|' \
      -e 's|"types": "src/index.ts"|"types": "dist/promise-capture.d.ts"|' \
      -e 's|"./src/index.ts"|"./dist/promise-capture.js"|g' \
      -e 's|"./src/promise-capture.ts"|"./dist/promise-capture.js"|g' \
      packages/domain/package.json \
 && mkdir -p node_modules/@ai-fsm \
 && ln -s ../../packages/log node_modules/@ai-fsm/log \
 && ln -s ../../packages/money node_modules/@ai-fsm/money \
 && ln -s ../../packages/email-templates node_modules/@ai-fsm/email-templates \
 && ln -s ../../packages/domain node_modules/@ai-fsm/domain
CMD ["node", "--experimental-require-module", "services/worker/dist/index.js"]