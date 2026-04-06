#!/bin/sh
set -e

echo "Substituting environment variables..."
echo "PORT=$PORT"
echo "BACKEND_URL=$BACKEND_URL"

envsubst '$PORT $BACKEND_URL' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "Starting nginx..."
exec nginx -g 'daemon off;'
