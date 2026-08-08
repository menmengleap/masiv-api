#!/bin/sh
set -e

# Default BACKEND_URL if not set
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"

# Ensure trailing slash for proxy_pass
case "$BACKEND_URL" in
  */) ;;
  *) BACKEND_URL="${BACKEND_URL}/" ;;
esac

export BACKEND_URL

# Substitute env vars in nginx config template
envsubst '$BACKEND_URL' < /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/default.conf

echo "nginx: proxying /api to ${BACKEND_URL}"

# Start nginx
exec nginx -g "daemon off;"
