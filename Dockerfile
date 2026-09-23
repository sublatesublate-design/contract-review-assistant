FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/addin/package.json packages/addin/package.json
COPY packages/desktop/package.json packages/desktop/package.json
COPY packages/server/package.json packages/server/package.json

RUN npm ci

COPY . .

RUN npm run build \
    && node packages/desktop/scripts/prepare-local-server.mjs

ENV NODE_ENV=production
ENV SERVE_ADDIN=true

EXPOSE 10000

CMD ["node", "packages/server/dist/index.js"]
