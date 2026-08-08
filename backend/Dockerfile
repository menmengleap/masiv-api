# ---- Build stage: compile TypeScript to dist/ (includes dev deps) ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
# Compiles to dist/ and copies migration .sql files into dist/db/migrations/
RUN npm run build

# ---- Runtime stage: slim image with production deps only ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Run as the built-in unprivileged user.
USER node
EXPOSE 4000

# Apply DB migrations (idempotent) before starting the API + bot + worker.
CMD ["sh", "-c", "npm run migrate:prod && node dist/index.js"]
