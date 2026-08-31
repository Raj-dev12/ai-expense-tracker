# A Dockerfile is a recipe for building an image: a sealed box containing the
# app and everything it needs to run. The same image runs on this laptop and on
# the server, which is the whole point of using one.

# --- stage 1: build -----------------------------------------------------------
# A "multi-stage" build uses two throwaway machines. The first one has the
# compiler and every development tool installed and turns TypeScript into
# JavaScript. The second one copies out only the result. The compiler never
# reaches the finished image, so it stays small and has less in it to go wrong.
FROM node:24-alpine AS build

WORKDIR /app

# The lock file is copied on its own, before the source code, so that Docker can
# reuse the cached "npm ci" layer whenever only the source has changed. Editing
# a route then no longer means reinstalling every dependency.
COPY package.json package-lock.json ./

# "npm ci" installs exactly the versions recorded in package-lock.json, rather
# than resolving fresh ones like "npm install" would. A build is meant to be
# reproducible: same input, same output, today and in six months.
RUN npm ci

COPY . .

# tsc reads tsconfig.json and writes JavaScript into dist/.
RUN npm run build

# --- stage 2: runtime ---------------------------------------------------------
FROM node:24-alpine AS runtime

WORKDIR /app

# Some libraries behave differently when told they are in production — Fastify
# logs less, and npm skips development dependencies.
ENV NODE_ENV=production

COPY package.json package-lock.json ./

# --omit=dev leaves out TypeScript, tsx and drizzle-kit. Those are build-time
# tools; nothing at runtime imports them.
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# migrate.ts looks for its SQL files at ./src/db/migrations, relative to the
# working directory. The migrations are data rather than code, so they are not
# compiled into dist/ and have to be copied across on their own.
COPY --from=build /app/src/db/migrations ./src/db/migrations

# Containers run as the all-powerful root user unless told otherwise. The node
# image ships an ordinary user called "node"; using it means a flaw in a
# dependency has far less to work with.
USER node

EXPOSE 3000

# Docker's own way of asking "is this thing actually working". Compose uses the
# answer to decide when the container is ready. The alpine image has no curl in
# it, so the check is a line of Node instead of another package to install.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Migrations run first, every time the container starts. They are written to be
# safe to re-run, so applying them on a database that is already up to date does
# nothing. This is what makes a fresh server need no manual setup step.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
