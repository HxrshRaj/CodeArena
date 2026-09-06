# Build context is the repo root: `docker build -f apps/worker/Dockerfile .`
#
# This image contains the Docker CLI. The executor shells out to `docker run`
# to create sandbox containers, and the container bind-mounts the host Docker
# socket at runtime (see docker-compose.yml, `full` profile). That makes this
# container trust-sensitive; the sandbox containers it spawns are the
# untrusted layer.
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl gnupg \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && chmod a+r /etc/apt/keyrings/docker.asc \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list \
  && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

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

# Overridden per service in docker-compose.yml (start:executor / start:review).
CMD ["npm", "run", "start:executor", "-w", "@codearena/worker"]
