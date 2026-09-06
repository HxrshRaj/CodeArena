# Build context is the repo root: `docker build -f apps/web/Dockerfile .`
FROM node:20-slim

WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm install

COPY . .

# The browser reaches the API on the host-published port, so the defaults in
# src/lib/config.ts are correct. Override here if you change the mapping.
ENV NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_WS_URL=ws://localhost:4000/ws
ENV NODE_ENV=production

RUN npm run build -w @codearena/web

EXPOSE 3100
CMD ["npm", "run", "start", "-w", "@codearena/web"]
