#!/bin/sh
# Render /usr/share/nginx/html/config.js from config.template.js by substituting
# the __API_BASE_URL__ token with the value of $API_BASE_URL.
# Runs at container start (before nginx), sourced by the standard nginx image's
# /docker-entrypoint.sh loop over /docker-entrypoint.d/*.sh.

set -eu

API_BASE_URL="${API_BASE_URL:-}"

TEMPLATE=/usr/share/nginx/html/config.template.js
TARGET=/usr/share/nginx/html/config.js

if [ ! -f "$TEMPLATE" ]; then
  echo "config template not found at $TEMPLATE" >&2
  exit 1
fi

echo "Rendering config.js with API_BASE_URL=${API_BASE_URL}"
sed "s|__API_BASE_URL__|${API_BASE_URL}|g" "$TEMPLATE" > "$TARGET"
