# Build context is the repo root: `docker build -f apps/api/Dockerfile .`
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

# Install deps against the full workspace manifest set.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm install

COPY . .
RUN npm run db:generate

ENV NODE_ENV=production
EXPOSE 4000

# Apply migrations + seed, then start the API.
CMD ["sh", "-c", "npm run migrate:deploy -w @codearena/db && npm run seed -w @codearena/db && npm run start -w @codearena/api"]
