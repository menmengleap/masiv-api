# ---- Build stage: produce static assets ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# VITE_API_URL stays empty: in production nginx proxies /api to the backend,
# so the dashboard talks to its own origin and the session cookie is first-party.
RUN npm run build

# ---- Runtime stage: nginx serving the SPA + proxying the API ----
FROM nginx:1.27-alpine AS runtime
RUN apk add --no-cache gettext
COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
