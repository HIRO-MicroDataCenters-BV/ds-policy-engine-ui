#!/bin/sh
# Render /etc/nginx/nginx.conf from nginx.conf.template by substituting
# ${BACKEND_URL} (and anything else we add later). Runs before nginx starts
# via the standard nginx image's /docker-entrypoint.d/*.sh loop.

set -eu

: "${BACKEND_URL:=http://ds-policy-engine:8000}"

TEMPLATE=/etc/nginx/nginx.conf.template
TARGET=/etc/nginx/nginx.conf

if [ ! -f "$TEMPLATE" ]; then
  echo "nginx template not found at $TEMPLATE" >&2
  exit 1
fi

echo "Rendering nginx.conf with BACKEND_URL=${BACKEND_URL}"
# Limit envsubst to our variables so nginx's own ${host} etc. stay untouched.
envsubst '${BACKEND_URL}' < "$TEMPLATE" > "$TARGET"
