# The frontend has no server of its own. Vite compiles React and Tailwind down
# to plain HTML, JavaScript and CSS files, and something has to hand those files
# to a browser. That something is Caddy, so this image is the built files plus
# Caddy — which makes it both the frontend container and the web front door.

# --- stage 1: build -----------------------------------------------------------
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# "npm run build" type-checks first and then writes dist/. A type error stops
# the image being built, which is the right moment to find out about it.
RUN npm run build

# --- stage 2: runtime ---------------------------------------------------------
# Caddy is a web server. It serves the files and, on a real domain, gets an
# HTTPS certificate by itself. No Node runs here at all: the finished frontend
# is just files, so the image has no need of the thing that produced them.
FROM caddy:2-alpine AS runtime

# /srv is Caddy's conventional home for files to serve. The Caddyfile that
# decides what to do with them is mounted in by compose rather than copied here,
# so routing can be changed and reloaded without rebuilding the frontend.
COPY --from=build /app/dist /srv

EXPOSE 80 443

# Asks Caddy for the front page and fails if it does not answer, so that
# "docker compose ps" says healthy rather than merely running. wget is part of
# the busybox toolset already in the image, so this adds nothing to install.
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget --quiet --spider --tries=1 http://127.0.0.1:80/ || exit 1
