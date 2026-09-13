FROM oven/bun:1.4.0

WORKDIR /usr/src/app

COPY package.json ./
COPY tsconfig.json ./
COPY packages ./packages
COPY techempower ./techempower

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["bun", "run", "techempower/server.ts"]
