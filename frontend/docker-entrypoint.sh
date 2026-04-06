#!/bin/sh
set -e

# Extract hostname from BACKEND_URL for the Host header
BACKEND_HOST=$(echo "$BACKEND_URL" | sed -e 's|https\?://||' -e 's|/.*||' -e 's|:.*||')
export BACKEND_HOST

echo "Substituting environment variables..."
echo "PORT=$PORT"
echo "BACKEND_URL=$BACKEND_URL"
echo "BACKEND_HOST=$BACKEND_HOST"

envsubst '$PORT $BACKEND_URL $BACKEND_HOST' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "Generated nginx config:"
cat /etc/nginx/nginx.conf | grep -A5 "location /api"

echo "Starting nginx..."
exec nginx -g 'daemon off;'
