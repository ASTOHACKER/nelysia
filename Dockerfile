# Production image for a Nelysia app built with `npm run build -- ./examples/hello/app.ts`.
# Prerequisite: `npm run package:build` first — examples import the
# `@narudom96/nelysia` self-reference, which resolves to ./dist-package.
# Build:  docker build -t nelysia:local .
# Run:    docker run --rm -p 3000:3000 -e PORT=3000 nelysia:local
FROM node:22-slim

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /srv/nelysia

# Production dependencies only (ws, graphql). --ignore-scripts skips
# lifecycle hooks; the CLI runs from source via --experimental-strip-types.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

# Framework package (self-reference target) + example app entry (run with
# --experimental-strip-types, no build step needed inside the image).
COPY dist-package ./dist-package
COPY packages ./packages
COPY examples ./examples

# Pre-generate the Node artifact so boot is instant and misconfig fails fast.
RUN npm run build -- ./examples/hello/app.ts --target node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/`).then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

USER node

CMD ["node", "--experimental-strip-types", "dist/server.node.ts"]
