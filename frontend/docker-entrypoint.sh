#!/bin/sh
set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"

# Use sed to replace placeholder — avoids envsubst interfering with nginx $variables
sed "s|BACKEND_URL_PLACEHOLDER|${BACKEND_URL}|g" \
  /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/default.conf

echo "nginx: proxying /api to ${BACKEND_URL}"

exec nginx -g "daemon off;"
