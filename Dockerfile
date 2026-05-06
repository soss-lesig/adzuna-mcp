# syntax=docker/dockerfile:1

FROM node:20-alpine

WORKDIR /app

# Install production dependencies first so this layer is cached separately
# from source changes. npm ci uses the lockfile for reproducible builds.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source after deps so source edits don't bust the install layer.
COPY src ./src

# Drop privileges to the non-root `node` user (provided by the base image).
USER node

# Documentary only: Railway injects PORT and the app reads it from env.
EXPOSE 3000

# HTTP transport entry point. Run node directly rather than `npm run start:http`
# because the npm script uses `--env-file=.env`, which fails in containers
# where env is injected directly via -e flags or the platform's secrets store.
CMD ["node", "src/index.http.js"]
